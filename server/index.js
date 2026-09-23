import express from 'express'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EdgeTTS } from 'edge-tts-universal'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist')
const port = Number(process.env.PORT || 8787)
const model = process.env.ANYMODEL_MODEL || 'ag/gemini-2.5-flash-lite'

function loadEnvFile() {
  const file = path.join(root, '.env')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
}
loadEnvFile()

const VOICES = new Set([
  'zh-CN-XiaoxiaoNeural',
  'zh-CN-XiaoyiNeural',
  'zh-CN-YunxiNeural',
  'zh-CN-YunjianNeural',
  'zh-CN-YunyangNeural',
  'zh-CN-YunxiaNeural',
])

const audioCache = new Map()
let ttsChain = Promise.resolve()
const hits = new Map()

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim()
  return req.ip || 'local'
}

function limited(req, bucket, max, windowMs) {
  const key = `${bucket}:${clientIp(req)}`
  const now = Date.now()
  const row = hits.get(key) || []
  const fresh = row.filter((at) => now - at < windowMs)
  if (fresh.length >= max) {
    hits.set(key, fresh)
    return true
  }
  fresh.push(now)
  hits.set(key, fresh)
  return false
}

function speakRate(slow, modeHint) {
  if (slow) return '-28%'
  if (modeHint === 'tones') return '-18%'
  return '-8%'
}

function synthesize(text, voice, rate) {
  const key = `${voice}|${rate}|${text}`
  const cached = audioCache.get(key)
  if (cached) return Promise.resolve(cached)
  const run = ttsChain.then(async () => {
    const again = audioCache.get(key)
    if (again) return again
    const tts = new EdgeTTS(text, voice, { rate, volume: '+0%', pitch: '+0Hz' })
    const result = await Promise.race([
      tts.synthesize(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
    ])
    const buffer = Buffer.from(await result.audio.arrayBuffer())
    if (buffer.length < 200) throw new Error('empty-audio')
    audioCache.set(key, buffer)
    if (audioCache.size > 500) {
      const first = audioCache.keys().next().value
      audioCache.delete(first)
    }
    return buffer
  })
  ttsChain = run.then(() => undefined, () => undefined)
  return run
}

function stripJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (fenced ? fenced[1] : text).trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('no-json')
  return JSON.parse(raw.slice(start, end + 1))
}

async function askModel(system, user, maxTokens) {
  const key = process.env.ANYMODEL_API_KEY
  if (!key) {
    const error = new Error('no-key')
    error.status = 503
    throw error
  }
  const response = await fetch('https://anymodel.org/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'ai-failed')
    error.status = response.status
    throw error
  }
  const content = payload?.choices?.[0]?.message?.content
  if (!content) throw new Error('empty-ai')
  return stripJson(content)
}

const SYSTEM = [
  'Ты преподаватель китайского для взрослых. Родной язык ученика — русский.',
  'Пиши по-русски, коротко и точно. Иероглифы только упрощённые.',
  'Пиньинь только с тоновыми знаками и пробелами между слогами.',
  'Не выдумывай чтения. Если не уверен, так и напиши в поле note.',
  'Ответ — один JSON-объект без markdown.',
].join(' ')

const app = express()
app.set('trust proxy', 1)
app.use(express.json({ limit: '24kb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ai: Boolean(process.env.ANYMODEL_API_KEY), model })
})

app.get('/api/voices', (_req, res) => {
  res.json({ voices: [...VOICES] })
})

app.post('/api/tts', async (req, res) => {
  if (limited(req, 'tts', 240, 60 * 60 * 1000)) {
    res.status(429).json({ error: 'Слишком много озвучки. Подожди немного.' })
    return
  }
  const text = String(req.body?.text || '').replace(/\s+/g, ' ').trim().slice(0, 180)
  const voice = String(req.body?.voice || '')
  const slow = Boolean(req.body?.slow)
  const modeHint = req.body?.mode === 'tones' ? 'tones' : 'vocab'
  if (!text || !VOICES.has(voice)) {
    res.status(400).json({ error: 'Нужны текст и известный голос.' })
    return
  }
  try {
    const audio = await synthesize(text, voice, speakRate(slow, modeHint))
    res.setHeader('content-type', 'audio/mpeg')
    res.setHeader('cache-control', 'public, max-age=86400')
    res.send(audio)
  } catch (error) {
    console.error('tts', error instanceof Error ? error.message : error)
    res.status(502).json({ error: 'Голос сейчас не ответил.' })
  }
})

app.post('/api/ai', async (req, res) => {
  if (limited(req, 'ai', 30, 60 * 60 * 1000)) {
    res.status(429).json({ error: 'Лимит объяснений на этот час исчерпан.' })
    return
  }
  const kind = String(req.body?.kind || '')
  try {
    if (kind === 'explain') {
      const hanzi = String(req.body.hanzi || '').slice(0, 16)
      const pinyin = String(req.body.pinyin || '').slice(0, 80)
      const ru = String(req.body.ru || '').slice(0, 80)
      const data = await askModel(
        SYSTEM,
        `Слово: ${hanzi} (${pinyin}) — «${ru}». JSON: {"hook":"одна живая фраза","usage":"как употреблять, 2 предложения","trap":"ошибка тона или смешение с похожим словом, либо пустая строка","similar":[{"hanzi":"","pinyin":"","ru":""}]}`,
        500,
      )
      res.json(data)
      return
    }
    if (kind === 'mnemonic') {
      const hanzi = String(req.body.hanzi || '').slice(0, 16)
      const pinyin = String(req.body.pinyin || '').slice(0, 80)
      const ru = String(req.body.ru || '').slice(0, 80)
      const data = await askModel(
        SYSTEM,
        `Придумай мнемонику для ${hanzi} (${pinyin}) — «${ru}». Опирайся на звучание и части иероглифа, не меняй значение. JSON: {"story":"3-5 предложений"}`,
        400,
      )
      res.json(data)
      return
    }
    if (kind === 'example') {
      const hanzi = String(req.body.hanzi || '').slice(0, 16)
      const pinyin = String(req.body.pinyin || '').slice(0, 80)
      const data = await askModel(
        SYSTEM,
        `Простое предложение уровня HSK 1–2 со словом ${hanzi} (${pinyin}). JSON: {"hanzi":"","pinyin":"","ru":""}`,
        300,
      )
      res.json(data)
      return
    }
    if (kind === 'lookup') {
      const hanzi = String(req.body.hanzi || '').slice(0, 16)
      const data = await askModel(
        SYSTEM,
        `Самое частое учебное значение слова «${hanzi}». JSON: {"pinyin":"","ru":"","pos":"","note":"","example":{"hanzi":"","pinyin":"","ru":""}}`,
        400,
      )
      res.json(data)
      return
    }
    if (kind === 'generate') {
      const topic = String(req.body.topic || '').slice(0, 80)
      const data = await askModel(
        SYSTEM,
        `8 полезных слов по теме «${topic}» для начинающего. Без чэнъюев. JSON: {"words":[{"hanzi":"","pinyin":"","ru":"","example":{"hanzi":"","pinyin":"","ru":""}}]}`,
        900,
      )
      res.json(data)
      return
    }
    res.status(400).json({ error: 'Неизвестный запрос.' })
  } catch (error) {
    const status = error.status || 502
    const message = status === 503 ? 'ИИ не подключён на сервере.' : 'Сейчас не получилось спросить модель. Попробуй ещё раз.'
    console.error('ai', error instanceof Error ? error.message : error)
    res.status(status).json({ error: message })
  }
})

if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(dist, 'index.html'))
  })
}

app.listen(port, '0.0.0.0', () => {
  console.log(`sisheng listening on ${port}`)
})
