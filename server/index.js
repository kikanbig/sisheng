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
const inflight = new Map()
const hits = new Map()
let ttsActive = 0
const ttsWaiters = []

function acquireTts() {
  if (ttsActive < 3) {
    ttsActive += 1
    return Promise.resolve()
  }
  return new Promise((resolve) => ttsWaiters.push(resolve))
}

function releaseTts() {
  ttsActive -= 1
  const next = ttsWaiters.shift()
  if (!next) return
  ttsActive += 1
  next()
}

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

const RATES = {
  slow: { word: '-32%', line: '-46%', tone: '-30%' },
  steady: { word: '-12%', line: '-32%', tone: '-20%' },
  clear: { word: '-4%', line: '-18%', tone: '-14%' },
  brisk: { word: '+4%', line: '-8%', tone: '-8%' },
}

function isPhrase(text) {
  const han = [...text].filter((char) => /\p{Script=Han}/u.test(char)).length
  return han >= 5 || /[。！？!?…]/.test(text)
}

function speakRate(speed, modeHint, text) {
  const row = RATES[speed] || RATES.steady
  if (modeHint === 'tones') return row.tone
  if (isPhrase(text)) return row.line
  return row.word
}

function synthesize(text, voice, rate) {
  const key = `${voice}|${rate}|${text}`
  const cached = audioCache.get(key)
  if (cached) return Promise.resolve(cached)
  const pending = inflight.get(key)
  if (pending) return pending
  const run = (async () => {
    await acquireTts()
    try {
      const again = audioCache.get(key)
      if (again) return again
      const tts = new EdgeTTS(text, voice, { rate, volume: '+0%', pitch: '+0Hz' })
      const result = await Promise.race([
        tts.synthesize(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
      ])
      const buffer = Buffer.from(await result.audio.arrayBuffer())
      if (buffer.length < 200) throw new Error('empty-audio')
      audioCache.set(key, buffer)
      if (audioCache.size > 500) {
        const first = audioCache.keys().next().value
        audioCache.delete(first)
      }
      return buffer
    } finally {
      inflight.delete(key)
      releaseTts()
    }
  })()
  inflight.set(key, run)
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

async function askModel(system, user, maxTokens, image) {
  const key = process.env.ANYMODEL_API_KEY
  if (!key) {
    const error = new Error('no-key')
    error.status = 503
    throw error
  }
  const names = model === 'ag/gemini-2.5-flash' ? [model] : [model, 'ag/gemini-2.5-flash']
  let last = new Error('ai-failed')
  for (const name of names) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch('https://anymodel.org/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: name,
          temperature: 0.4,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            {
              role: 'user',
              content: image
                ? [
                    { type: 'text', text: user },
                    { type: 'image_url', image_url: { url: image } },
                  ]
                : user,
            },
          ],
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (response.ok) {
        const content = payload?.choices?.[0]?.message?.content
        if (!content) throw new Error('empty-ai')
        return stripJson(content)
      }
      last = new Error(payload?.error?.message || 'ai-failed')
      last.status = response.status
      if (response.status !== 502 && response.status !== 503) throw last
    }
  }
  throw last
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
app.use(express.json({ limit: '2mb' }))

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
  const requested = String(req.body?.speed || (req.body?.slow ? 'slow' : 'steady'))
  const speed = requested in RATES ? requested : 'steady'
  const modeHint = req.body?.mode === 'tones' ? 'tones' : 'vocab'
  if (!text || !VOICES.has(voice)) {
    res.status(400).json({ error: 'Нужны текст и известный голос.' })
    return
  }
  try {
    const audio = await synthesize(text, voice, speakRate(speed, modeHint, text))
    res.setHeader('content-type', 'audio/mpeg')
    res.setHeader('cache-control', 'public, max-age=86400')
    res.send(audio)
  } catch (error) {
    console.error('tts', error instanceof Error ? error.message : error)
    res.status(502).json({ error: 'Голос сейчас не ответил.' })
  }
})

const glossCache = new Map()
const sensesCache = new Map()

app.post('/api/ai', async (req, res) => {
  const kind = String(req.body?.kind || '')
  const bucket = kind === 'gloss' ? 'gloss' : 'ai'
  if (limited(req, bucket, kind === 'gloss' ? 400 : 120, 60 * 60 * 1000)) {
    res.status(429).json({ error: 'Лимит объяснений на этот час исчерпан.' })
    return
  }
  try {
    if (kind === 'gloss') {
      const text = String(req.body.text || '').replace(/\s+/g, ' ').trim().slice(0, 80)
      if (!/\p{Script=Han}/u.test(text)) {
        res.json({ words: [] })
        return
      }
      const cached = glossCache.get(text)
      if (cached) {
        res.json(cached)
        return
      }
      const data = await askModel(
        SYSTEM,
        `Фраза: «${text}». Разбей её на слова в порядке следования. Слово из нескольких иероглифов не дроби. Знаки препинания пропусти. Для каждого слова: hanzi — ровно как во фразе; pinyin — с тоном, как читается здесь; ru — значение именно в этой фразе, 1–4 слова, а у частицы или служебного слова — его вид, например «частица завершённости», «вопросительная частица», «предлог места»; note — для частиц и служебных слов (了, 吗, 的, 呢, 把, 是, 在, 都…) одно предложение, что оно делает в этой фразе, иначе пустая строка; chars — если в слове два иероглифа и больше, разбери каждый иероглиф отдельно: hanzi, pinyin с тоном как в этом слове, ru — его собственное значение, 1–3 слова; у слова из одного иероглифа chars пустой. JSON: {"words":[{"hanzi":"","pinyin":"","ru":"","note":"","chars":[{"hanzi":"","pinyin":"","ru":""}]}]}`,
        1200,
      )
      const words = Array.isArray(data?.words) ? data.words : []
      const clean = {
        words: words
          .filter((row) => row && typeof row.hanzi === 'string' && row.hanzi.trim())
          .slice(0, 24)
          .map((row) => ({
            hanzi: String(row.hanzi).trim(),
            pinyin: String(row.pinyin || '').trim(),
            ru: String(row.ru || '').trim(),
            note: String(row.note || '').trim(),
            chars: [...String(row.hanzi).trim()].length > 1 && Array.isArray(row.chars)
              ? row.chars
                  .filter((part) => part && typeof part.hanzi === 'string' && [...part.hanzi.trim()].length === 1)
                  .slice(0, 8)
                  .map((part) => ({
                    hanzi: part.hanzi.trim(),
                    pinyin: String(part.pinyin || '').trim(),
                    ru: String(part.ru || '').trim(),
                  }))
              : [],
          })),
      }
      glossCache.set(text, clean)
      if (glossCache.size > 2000) glossCache.delete(glossCache.keys().next().value)
      res.json(clean)
      return
    }
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
    if (kind === 'senses') {
      const hanzi = String(req.body.hanzi || '').trim().slice(0, 16)
      const pinyin = String(req.body.pinyin || '').trim().slice(0, 80)
      const ru = String(req.body.ru || '').trim().slice(0, 80)
      const key = `${hanzi}|${pinyin}|${ru}`
      const cached = sensesCache.get(key)
      if (cached) {
        res.json(cached)
        return
      }
      const data = await askModel(
        SYSTEM,
        `Слово: ${hanzi} (${pinyin}), основное значение — «${ru}». Перечисли другие значения этого слова, кроме основного, от частых к редким, не больше 5. Если у иероглифа есть другое чтение, включи и значения с ним; pinyin — как читается именно в этом значении. Для каждого: pinyin; ru — 1–4 слова; example — короткая естественная фраза или сочетание уровня HSK 1–3, как говорят носители, именно с этим значением. Не повторяй основное значение и его оттенки. Бери только значения, которые реально встречаются в современном языке и есть в словарях; если сомневаешься в значении или примере — не включай. Если других значений нет, верни пустой список. JSON: {"senses":[{"pinyin":"","ru":"","example":{"hanzi":"","pinyin":"","ru":""}}]}`,
        900,
      )
      const senses = Array.isArray(data?.senses) ? data.senses : []
      const clean = {
        senses: senses
          .filter((row) => row && typeof row.ru === 'string' && row.ru.trim())
          .slice(0, 5)
          .map((row) => ({
            pinyin: String(row.pinyin || '').trim(),
            ru: String(row.ru).trim(),
            example:
              row.example && typeof row.example.hanzi === 'string' && row.example.hanzi.trim()
                ? {
                    hanzi: row.example.hanzi.replace(/\s+/g, ''),
                    pinyin: String(row.example.pinyin || '').trim(),
                    ru: String(row.example.ru || '').trim(),
                  }
                : null,
          })),
      }
      sensesCache.set(key, clean)
      if (sensesCache.size > 2000) sensesCache.delete(sensesCache.keys().next().value)
      res.json(clean)
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
      const query = String(req.body.query || req.body.hanzi || '').replace(/\s+/g, ' ').trim().slice(0, 40)
      if (!query) {
        res.status(400).json({ error: 'Напиши иероглиф или пиньинь.' })
        return
      }
      const data = await askModel(
        SYSTEM,
        `Ввод ученика: «${query}». Это иероглифы либо пиньинь, с тонами или с цифрами. Одно учебное слово. Если пиньинь неоднозначен — самое частое. JSON: {"hanzi":"","pinyin":"","ru":"","example":{"hanzi":"","pinyin":"","ru":""}}`,
        400,
      )
      res.json(data)
      return
    }
    if (kind === 'scan') {
      const image = String(req.body.image || '')
      if (!/^data:image\/(?:jpeg|png|webp);base64,/.test(image) || image.length > 1_400_000) {
        res.status(400).json({ error: 'Нужна фотография поменьше.' })
        return
      }
      const data = await askModel(
        SYSTEM,
        'На фото китайский текст. Выпиши слова, которые стоит учить, не больше 8. Одно слово или короткая фраза — одна карточка, не дроби фразу на иероглифы. Если китайского текста нет, верни пустой список. JSON: {"words":[{"hanzi":"","pinyin":"","ru":"","example":{"hanzi":"","pinyin":"","ru":""}}]}',
        900,
        image,
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
    const missing = error instanceof Error && error.message === 'no-key'
    const message = missing ? 'ИИ не подключён на сервере.' : 'Модель сейчас занята. Нажми ещё раз через несколько секунд.'
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
