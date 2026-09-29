// Собирает встроенные разборы слов и примеров. Обычные слова берутся из учебных
// данных и БКРС, предложения один раз разбирает модель. Результат попадает в
// приложение и больше не требует API-запросов на устройствах.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'src', 'data', 'glosses.json')
const BATCH = 8
const PARALLEL = 3
const models = () =>
  [...new Set([process.env.ANYMODEL_MODEL || 'cc/claude-sonnet-5', 'ag/gemini-3.7-flash-low', 'ag/gemini-2.5-flash'])]

function loadEnv() {
  const file = path.join(root, '.env')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const at = trimmed.indexOf('=')
    if (at > 0 && !process.env[trimmed.slice(0, at).trim()]) {
      process.env[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim()
    }
  }
}

function sourceRows(file, name) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const marker = `const ${name} = \``
  const from = source.indexOf(marker)
  if (from < 0) throw new Error(`${file}: не найден ${name}`)
  const start = from + marker.length
  const end = source.indexOf('`', start)
  return source
    .slice(start, end)
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('|').map((part) => part.trim()))
}

const shortRu = (text) => {
  const first = String(text || '').replace(/\([^)]*\)/g, '').split(/[;,]/)[0].trim()
  return first.length > 64 ? `${first.slice(0, 62).replace(/\s+\S*$/, '')}…` : first
}

const SERVICE_RU = {
  了: 'частица завершённости',
  吗: 'вопросительная частица',
  的: 'притяжательная частица',
  得: 'частица степени',
  地: 'наречная частица',
  把: 'маркер прямого дополнения',
  被: 'маркер пассива',
  呢: 'модальная частица',
  吧: 'побудительная частица',
  着: 'частица длительности',
  过: 'частица опыта',
}
const CHAR_RU = {
  一: 'один',
  二: 'два',
  三: 'три',
  四: 'четыре',
  五: 'пять',
  六: 'шесть',
  七: 'семь',
  八: 'восемь',
  九: 'девять',
  十: 'десять',
  百: 'сто',
  千: 'тысяча',
  万: 'десять тысяч',
  亿: 'сто миллионов',
}

function dictionaryEntries() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'dict', 'manifest.json'), 'utf8'))
  const compressed = fs.readFileSync(path.join(root, 'public', 'dict', manifest.files.index))
  const rows = zlib.gunzipSync(compressed).toString('utf8').split('\n@@\n')[0].split('\n')
  const entries = new Map()
  for (const line of rows) {
    const [hanzi, pinyin, , ru] = line.split('\t')
    if (!entries.has(hanzi)) entries.set(hanzi, { pinyin: pinyin.split(', ')[0], ru: shortRu(ru) })
  }
  return entries
}

function lexical(text, pinyin, ru, note, dictionary) {
  const han = [...text].filter((char) => /\p{Script=Han}/u.test(char))
  const readings = String(pinyin || '').split(/\s+/).filter(Boolean)
  const erhua = readings.length === han.filter((char) => char !== '儿').length && han.includes('儿')
  let readingAt = 0
  const knownWord = dictionary.get(text) || {}
  const chars =
    han.length > 1
      ? han.map((char, index) => {
          const known = dictionary.get(char) || {}
          const reading =
            readings.length === han.length
              ? readings[index]
              : erhua && char === '儿'
                ? 'r'
                : erhua
                  ? readings[readingAt++]?.replace(/r$/, '')
                  : known.pinyin || ''
          return {
            hanzi: char,
            pinyin: reading,
            ru: char === '儿' && reading === 'r' ? 'суффикс эризации' : CHAR_RU[char] || known.ru || '',
          }
        })
      : []
  return [
    {
      hanzi: text,
      pinyin: String(pinyin || knownWord.pinyin || ''),
      ru: shortRu(ru) || knownWord.ru || '',
      note: String(note || ''),
      chars,
    },
  ]
}

function cleanWords(text, rows) {
  if (!Array.isArray(rows)) return null
  let at = 0
  const words = []
  for (const row of rows.slice(0, 24)) {
    const hanzi = String(row?.hanzi || '').trim()
    const index = text.indexOf(hanzi, at)
    if (!hanzi || index < 0) continue
    at = index + hanzi.length
    words.push({
      hanzi,
      pinyin: String(row.pinyin || '').trim(),
      ru: String(row.ru || '').trim(),
      note: String(row.note || '').trim(),
      chars:
        [...hanzi].length > 1 && Array.isArray(row.chars)
          ? row.chars
              .filter((part) => part && [...String(part.hanzi || '').trim()].length === 1)
              .slice(0, 8)
              .map((part) => ({
                hanzi: String(part.hanzi).trim(),
                pinyin: String(part.pinyin || '').trim(),
                ru: String(part.ru || '').trim(),
              }))
          : [],
    })
  }
  return words.length && words.map((word) => word.hanzi).join('') === [...text].filter((char) => /\p{Script=Han}/u.test(char)).join('')
    ? words
    : null
}

const complete = (words) =>
  Array.isArray(words) &&
  words.length > 0 &&
  words.every((word) => {
    const count = [...word.hanzi].length
    return (
      word.pinyin &&
      /\p{Script=Cyrillic}/u.test(word.ru) &&
      (count === 1 || word.chars?.length === count) &&
      (word.chars || []).every((char) => char.pinyin && /\p{Script=Cyrillic}/u.test(char.ru))
    )
  })

function enrich(words, dictionary) {
  return words.map((word) => {
    const fallback = lexical(word.hanzi, word.pinyin, word.ru, word.note, dictionary)[0]
    const byIndex = [...word.hanzi].map((hanzi, index) => {
      const own = word.chars?.[index]
      return own?.hanzi === hanzi && own.pinyin && own.ru ? own : fallback.chars[index]
    })
    return {
      ...word,
      ru: word.ru || SERVICE_RU[word.hanzi] || fallback.ru,
      chars: [...word.hanzi].length > 1 ? byIndex : [],
    }
  })
}

function jsonOf(raw) {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('Модель не вернула JSON')
  return JSON.parse(raw.slice(start, end + 1))
}

async function ask(items) {
  const key = process.env.ANYMODEL_API_KEY
  if (!key) throw new Error('В .env нет ANYMODEL_API_KEY')
  const list = items.map((item, id) => ({ id, text: item.text, pinyin: item.pinyin, ru: item.ru }))
  const prompt = `Разбери каждую китайскую фразу на слова в порядке следования.
Слово из нескольких иероглифов не дроби; пунктуацию пропусти.
pinyin — с тонами и именно для этого контекста.
ru — значение слова здесь, 1–4 русских слова строго кириллицей; числа тоже пиши словами.
note — только для служебных слов и частиц: одно короткое предложение об их роли здесь; иначе "".
chars — для слова из 2+ иероглифов: каждый иероглиф отдельно с контекстным pinyin и собственным кратким русским значением кириллицей; для одного иероглифа [].
Не изменяй id. Верни только JSON:
{"items":[{"id":0,"words":[{"hanzi":"","pinyin":"","ru":"","note":"","chars":[{"hanzi":"","pinyin":"","ru":""}]}]}]}

Фразы:
${JSON.stringify(list)}`
  let last = new Error('Модель не ответила')
  for (const model of models()) {
    try {
      const response = await fetch('https://anymodel.org/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(60000),
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 7000,
          messages: [
            { role: 'system', content: 'Ты составляешь точные учебные данные по современному китайскому языку для русскоязычного начинающего.' },
            { role: 'user', content: prompt },
          ],
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error?.message || `${response.status}`)
      const raw = payload?.choices?.[0]?.message?.content
      if (typeof raw !== 'string') throw new Error('Пустой ответ')
      const rows = jsonOf(raw)?.items
      if (!Array.isArray(rows)) throw new Error('Нет массива items')
      const result = new Map()
      for (const row of rows) {
        const item = items[Number(row?.id)]
        if (!item) continue
        const cleaned = cleanWords(item.text, row.words)
        const words = cleaned ? enrich(cleaned, dictionary) : null
        if (words && complete(words)) result.set(item.text, words)
      }
      if (result.size) return result
      throw new Error('Модель вернула неполный разбор')
    } catch (error) {
      last = error instanceof Error ? error : last
      console.error(`Повторяю пакет: ${model} — ${last.message}`)
    }
  }
  throw last
}

function write(data) {
  fs.writeFileSync(output, `${JSON.stringify(Object.fromEntries([...data].sort(([a], [b]) => a.localeCompare(b, 'zh'))))}\n`)
}

loadEnv()
const dictionary = dictionaryEntries()
const lesson = sourceRows('src/data/lesson1.ts', 'LINES')
const lesson2 = sourceRows('src/data/lesson2.ts', 'LINES')
const hsk1 = sourceRows('src/data/catalog.ts', 'HSK1')
const extra = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'hsk-levels.json'), 'utf8'))
const result = new Map()
const contexts = new Map()

const addContext = (text, pinyin, ru) => {
  if (text && /\p{Script=Han}/u.test(text) && !contexts.has(text)) contexts.set(text, { text, pinyin, ru })
}
const addLexical = (hanzi, pinyin, ru, note) => {
  const words = lexical(hanzi, pinyin, ru, note, dictionary)
  if (complete(words)) result.set(hanzi, words)
  else addContext(hanzi, pinyin, ru)
}

for (const row of [...lesson, ...lesson2]) {
  const [hanzi, pinyin, ru, pos, exH, exP, exR, note] = row
  if (pos === 'фраза') addContext(hanzi, pinyin, ru)
  else addLexical(hanzi, pinyin, ru, note)
  addContext(exH, exP, exR)
}
for (const row of hsk1) {
  const [hanzi, pinyin, ru, , exH, exP, exR, note] = row
  addLexical(hanzi, pinyin, ru, note)
  addContext(exH, exP, exR)
}
for (const [hanzi, pinyin, ru] of extra) {
  addLexical(hanzi, pinyin, ru, '')
}

if (fs.existsSync(output)) {
  const previous = JSON.parse(fs.readFileSync(output, 'utf8'))
  for (const [text, words] of Object.entries(previous)) {
    const cleaned = cleanWords(text, words)
    const ready = cleaned ? enrich(cleaned, dictionary) : null
    if (contexts.has(text) && ready && complete(ready)) result.set(text, ready)
  }
}

let missing = [...contexts.values()].filter((item) => !result.has(item.text))
console.log(`${result.size} слов собраны локально; модель разберёт ${missing.length} фраз`)

while (missing.length) {
  const wave = []
  for (let i = 0; i < PARALLEL && missing.length; i += 1) wave.push(missing.splice(0, BATCH))
  const replies = await Promise.all(
    wave.map(async (items) => {
      try {
        return await ask(items)
      } catch {
        return new Map()
      }
    }),
  )
  for (const reply of replies) for (const [text, words] of reply) result.set(text, words)
  write(result)
  const unresolved = wave.flat().filter((item) => !result.has(item.text))
  if (unresolved.length) {
    console.log(`Повторяю по одной: ${unresolved.length}`)
    for (const item of unresolved) {
      try {
        const reply = await ask([item])
        if (reply.has(item.text)) result.set(item.text, reply.get(item.text))
      } catch {
        console.error(`Сохраняю локальный разбор: ${item.text}`)
      }
    }
    write(result)
  }
  console.log(`Готово ${result.size}/${result.size + missing.length}`)
}

const absent = [...contexts.values()].filter((item) => !result.has(item.text))
for (const item of absent) result.set(item.text, lexical(item.text, item.pinyin, item.ru, '', dictionary))
write(result)
console.log(`${result.size} встроенных разборов → src/data/glosses.json`)
