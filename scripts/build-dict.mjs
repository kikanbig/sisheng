// Собирает public/dict из свежей выгрузки 大БКРС (bkrs.info, свободная лицензия)
// и частотного словаря jieba (MIT); редкие и вариантные иероглифы отсекаются по «Таблице общеупотребительных
// стандартных иероглифов» 2013 года (поле kTGH в Unicode Unihan).
// Запуск: node scripts/build-dict.mjs [dabkrs] [jieba dict.txt] [Unihan_OtherMappings.txt]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'dict')

async function download(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 sisheng-dict-builder' } })
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

async function bkrsText(file) {
  if (file) return fs.readFileSync(file, 'utf8')
  const page = (await download('https://bkrs.info/p47')).toString('utf8')
  const href = page.match(/downloads\/daily\/dabkrs_\d+\.gz/)?.[0]
  if (!href) throw new Error('На bkrs.info/p47 не нашлась ежедневная выгрузка')
  console.log(`BKRS: ${href}`)
  return zlib.gunzipSync(await download(`https://bkrs.info/${href}`)).toString('utf8')
}

async function jiebaText(file) {
  if (file) return fs.readFileSync(file, 'utf8')
  return (await download('https://raw.githubusercontent.com/fxsjy/jieba/master/jieba/dict.txt')).toString('utf8')
}

async function unihanText(file) {
  if (file) return fs.readFileSync(file, 'utf8')
  const zip = path.join(os.tmpdir(), 'sisheng-unihan.zip')
  fs.writeFileSync(zip, await download('https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip'))
  return execFileSync('unzip', ['-p', zip, 'Unihan_OtherMappings.txt'], { maxBuffer: 1 << 28 }).toString('utf8')
}

const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w', '']
const FINALS = [
  'a', 'o', 'e', 'ai', 'ei', 'ao', 'ou', 'an', 'en', 'ang', 'eng', 'ong', 'er',
  'i', 'ia', 'ie', 'iao', 'iu', 'ian', 'in', 'iang', 'ing', 'iong',
  'u', 'ua', 'uo', 'uai', 'ui', 'uan', 'un', 'uang', 'ueng',
  'ü', 'üe', 'üan', 'ün', 'ue',
]
const SYLLABLES = new Set(['m', 'n', 'ng', 'hm', 'hng'])
for (const initial of INITIALS) for (const final of FINALS) {
  SYLLABLES.add(initial + final)
  SYLLABLES.add(`${initial + final}r`)
}

const BARE = { ā: 'a', á: 'a', ǎ: 'a', à: 'a', ē: 'e', é: 'e', ě: 'e', è: 'e', ī: 'i', í: 'i', ǐ: 'i', ì: 'i', ō: 'o', ó: 'o', ǒ: 'o', ò: 'o', ū: 'u', ú: 'u', ǔ: 'u', ù: 'u', ǖ: 'ü', ǘ: 'ü', ǚ: 'ü', ǜ: 'ü', ḿ: 'm', ń: 'n', ň: 'n', ǹ: 'n' }

const bareOf = (text) => [...text].map((ch) => BARE[ch] || ch).join('')
const charReadings = new Map()

function segmentations(parts, strict) {
  const chars = [...parts.join('')]
  const starts = new Set([0])
  let at = 0
  for (const part of parts) {
    starts.add(at)
    at += [...part].length
  }
  const bare = chars.map((ch) => BARE[ch] || ch)
  const marked = chars.map((ch) => (BARE[ch] ? 1 : 0))
  const n = chars.length
  const paths = new Array(n + 1).fill(null)
  paths[0] = [[]]
  for (let i = 0; i < n; i += 1) {
    if (!paths[i]) continue
    for (let len = 1; len <= 7 && i + len <= n; len += 1) {
      const piece = bare.slice(i, i + len).join('')
      if (!SYLLABLES.has(piece)) continue
      if (!starts.has(i) && /^(?:[iuü]|m$|n$|ng$|hm$|hng$)/.test(piece)) continue
      if (!starts.has(i) && /^[aoe]/.test(piece) && (strict || piece.endsWith('r'))) continue
      if (marked.slice(i, i + len).reduce((a, b) => a + b, 0) > 1) continue
      const next = paths[i].map((path) => [...path, i + len])
      paths[i + len] = [...(paths[i + len] || []), ...next].slice(0, 24)
    }
  }
  return (paths[n] || []).map((cuts) => {
    const pieces = []
    let from = 0
    for (const cut of cuts) {
      pieces.push(chars.slice(from, cut).join(''))
      from = cut
    }
    return pieces
  })
}

function spaceReading(reading, hanzi) {
  const han = [...hanzi]
  const parts = reading.toLowerCase().replace(/[’'ʼ-]/g, ' ').split(/\s+/).filter(Boolean)
  const fit = (pieces) =>
    pieces.reduce((score, piece, index) => {
      const known = charReadings.get(han[index])
      return score + (known?.has(bareOf(piece)) || known?.has(bareOf(piece).replace(/r$/, '')) ? 1 : 0)
    }, 0)
  const strict = segmentations(parts, true)
  const erhua = han.length - han.filter((char) => char === '儿').length
  let exact = strict.filter((pieces) => pieces.length === han.length)
  if (!exact.length) exact = strict.filter((pieces) => pieces.length === erhua)
  if (!exact.length) exact = segmentations(parts, false).filter((pieces) => pieces.length === han.length)
  if (exact.length) return exact.reduce((a, b) => (fit(b) > fit(a) ? b : a)).join(' ')
  if (!strict.length) return null
  return strict.reduce((a, b) => (b.length < a.length ? b : a)).join(' ')
}

function readingsOf(line) {
  return line
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\S*\p{Script=Cyrillic}\S*/gu, ' ')
    .split(/[,;]/)
    .map((reading) => reading.trim())
    .filter((reading) => /[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/i.test(reading))
}

function cleanBody(lines) {
  return lines
    .join('')
    .replace(/\[\/?\*\]/g, '')
    .replace(/\[c[^\]]*\]|\[\/c\]/g, '')
    .replace(/\[b\](\p{Script=Cyrillic})\[\/b\]/gu, '$1')
    .replace(/\\\[/g, '⟦')
    .replace(/\\\]/g, '⟧')
    .replace(/\t/g, ' ')
    .split(/(\[m\d\][\s\S]*?\[\/m\])/)
    .map((part) => (part.startsWith('[m') ? part : part.trim() && `[m1]${part.trim()}[/m]`))
    .filter((part) => part && !/^\[m\d\]\s*-{3,}\s*\[\/m\]$/.test(part))
    .map(splitExamples)
    .join('')
}

// «[m1]птенец[ex]喂雏鸟 …[/ex][/m]» → перевод отдельной строкой, пример — вложенной.
function splitExamples(part) {
  const match = part.match(/^\[m(\d)\]([\s\S]*?)\[\/m\]$/)
  if (!match) return part
  const [, level, content] = match
  const at = content.indexOf('[ex]')
  if (at <= 0 || !content.slice(0, at).trim()) return part
  const examples = content.slice(at).match(/\[ex\][\s\S]*?\[\/ex\]/g) || []
  const deeper = Math.min(Number(level) + 1, 9)
  return `[m${level}]${content.slice(0, at).trim()}[/m]${examples.map((example) => `[m${deeper}]${example}[/m]`).join('')}`
}

const freq = new Map()
for (const line of (await jiebaText(process.argv[3])).split('\n')) {
  const [word, count] = line.split(' ')
  if (word) freq.set(word, Number(count) || 0)
}

// Номер в таблице: 1–3500 основные, 3501–6500 второй уровень, дальше фамилии, топонимы и термины.
const standard = new Map()
for (const line of (await unihanText(process.argv[4])).split('\n')) {
  const match = line.match(/^U\+([0-9A-F]+)\tkTGH\t2013:(\d+)/)
  if (match) standard.set(String.fromCodePoint(parseInt(match[1], 16)), Number(match[2]))
}

const entries = []
const skipped = { variant: 0, rareChar: 0 }
for (const block of (await bkrsText(process.argv[2])).split(/\n\s*\n/)) {
  const lines = block.split('\n')
  const hanzi = lines[0]?.replace(/^\uFEFF/, '').trim()
  if (!hanzi || !/^\p{Script=Han}+$/u.test(hanzi)) continue
  const count = [...hanzi].length
  const f = freq.get(hanzi) || 0
  if (count > 1 && !f) continue
  const variant = [...hanzi].some((char) => !standard.has(char))
  const rareChar = count === 1 && standard.get(hanzi) > 6500
  const rest = lines.slice(1).map((line) => line.trim()).filter(Boolean)
  const pinyinLine = rest[0] && !rest[0].startsWith('[') ? rest.shift() : ''
  const readings = readingsOf(pinyinLine || '')
  if (!readings.length) continue
  if (count === 1) {
    const set = charReadings.get(hanzi) || new Set()
    for (const reading of readings) set.add(bareOf(reading.toLowerCase().replace(/\s+/g, '')))
    charReadings.set(hanzi, set)
  }
  if (variant || rareChar) {
    skipped[variant ? 'variant' : 'rareChar'] += 1
    continue
  }
  const body = cleanBody(rest)
  if (body) entries.push({ hanzi, readings, f, body })
}
console.log(`Отсеяно: вариантных и нестандартных ${skipped.variant}, редких одиночных ${skipped.rareChar}`)

const plain = (text) => text.replace(/\[\/?(?:i|p|b|ex|ref)\]/g, '').replace(/⟦/g, '[').replace(/⟧/g, ']').replace(/\s+/g, ' ').trim()
const ruNorm = (text) => text.toLowerCase().replace(/ё/g, 'е')
const lines = (body) => [...body.matchAll(/\[m\d\]([\s\S]*?)\[\/m\]/g)].map((match) => match[1]).filter((line) => !line.includes('[ex]'))

// Сначала ищем строку с настоящим переводом, потом — с пояснением курсивом (们), в крайнем случае берём ссылку «см. 杩头».
const SHORT_PASSES = [
  (line) => /\p{Script=Cyrillic}{2}/u.test(line.replace(/\[(i|p|b|ref)\][\s\S]*?\[\/\1\]/g, ' ').replace(/\p{Script=Cyrillic}+\.(?!\.)/gu, ' ')),
  (line) => /\p{Script=Cyrillic}{3}/u.test(line.replace(/\[(p|b)\][\s\S]*?\[\/\1\]/g, ' ')),
  (line) => /\[ref\]|\p{Script=Han}/u.test(line),
]

function shortOf(body) {
  for (const [pass, fits] of SHORT_PASSES.entries()) {
    for (const line of lines(body)) {
      if (!fits(line)) continue
      const text = plain(pass === 2 ? line.replace(/\[b\][\s\S]*?\[\/b\]/g, ' ') : line.replace(/\[(b|p)\][\s\S]*?\[\/\1\]/g, ' '))
        .replace(/^\s*(?:\d+\)|[а-я]\)|[IVX]+)\s*/i, '')
        .trim()
      if (text) return text.length > 110 ? `${text.slice(0, 108).replace(/[\s,;]+\S*$/, '')}…` : text
    }
  }
  return ''
}

function meanings(body) {
  return lines(body)
    .map((line) =>
      line
        .replace(/\[(i|p|b|ref)\][\s\S]*?\[\/\1\]/g, ' ')
        .replace(/⟦|⟧/g, '')
        .replace(/^\s*(?:\d+\)|[а-я]\))\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((text) => /\p{Script=Cyrillic}/u.test(text))
    .slice(0, 12)
}

const rows = []
for (const { hanzi, readings, f, body } of entries) {
  const spaced = [...new Set(readings.map((reading) => spaceReading(reading, hanzi)).filter(Boolean))]
  if (spaced.length) rows.push({ hanzi, pinyin: spaced.join(', '), f, body })
}
rows.sort((a, b) => b.f - a.f)

// Русский индекс: слово → записи, где оно есть в значениях. Качество 0–7: целый смысл (+4), первое значение (+2) или одно из первых трёх (+1).
const tokens = new Map()
rows.forEach((row, id) => {
  meanings(row.body).forEach((line, index) => {
    const chunks = ruNorm(line.replace(/\([^)]*\)/g, ' ')).split(/[;,]/).map((chunk) => chunk.replace(/[^\p{L}\s-]/gu, ' ').replace(/\s+/g, ' ').trim())
    for (const token of new Set(ruNorm(line).match(/\p{Script=Cyrillic}[\p{Script=Cyrillic}-]*/gu) || [])) {
      if (token.length < 2) continue
      const quality = (chunks.includes(token) ? 4 : 0) + (index === 0 ? 2 : index < 3 ? 1 : 0)
      const list = tokens.get(token) || []
      const last = list[list.length - 1]
      if (last && last[0] === id) last[1] = Math.max(last[1], quality)
      else list.push([id, quality])
      tokens.set(token, list)
    }
  })
})

const index = rows.map((row) => [row.hanzi, row.pinyin, row.f, shortOf(row.body)].join('\t'))
const ru = [...tokens.keys()].sort().map((token) => {
  let prev = 0
  const packed = tokens.get(token).map(([id, quality]) => {
    const value = id * 8 + quality
    const delta = value - prev
    prev = value
    return delta.toString(36)
  })
  return `${token}\t${packed.join(',')}`
})

const version = new Date().toISOString().slice(0, 16).replace(/\D/g, '')
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })
const write = (name, text) => {
  const gz = zlib.gzipSync(text, { level: 9 })
  fs.writeFileSync(path.join(outDir, name), gz)
  return gz.length
}
const files = {
  index: `index.${version}.txt.gz`,
  bodies: `bodies.${version}.txt.gz`,
}
const bytes = write(files.index, `${index.join('\n')}\n@@\n${ru.join('\n')}`) + write(files.bodies, rows.map((row) => row.body).join('\n'))
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ version, count: rows.length, bytes, files }))
console.log(`${rows.length} статей, ${tokens.size} русских слов → public/dict (${(bytes / 1e6).toFixed(1)} МБ)`)
