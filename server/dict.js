import fs from 'node:fs'
import zlib from 'node:zlib'

const BARE = { ā: 'a', á: 'a', ǎ: 'a', à: 'a', ē: 'e', é: 'e', ě: 'e', è: 'e', ī: 'i', í: 'i', ǐ: 'i', ì: 'i', ō: 'o', ó: 'o', ǒ: 'o', ò: 'o', ū: 'u', ú: 'u', ǔ: 'u', ù: 'u', ǖ: 'ü', ǘ: 'ü', ǚ: 'ü', ǜ: 'ü', ḿ: 'm', ń: 'n', ň: 'n', ǹ: 'n' }
const MARKS = ['', 'āēīōūǖ', 'áéíóúǘ', 'ǎěǐǒǔǚ', 'àèìòùǜ']
const VOWELS = 'aeiouü'
const HAN = /\p{Script=Han}/u

const words = []
const pinyinKeys = []
const byFirstChar = new Map()
let ruTokens = []
let ruPostings = []

const bare = (text) => [...text].map((ch) => BARE[ch] || ch).join('')
const compact = (text) => text.toLowerCase().replace(/[\s’'ʼ-]/g, '')
const ruNorm = (text) => text.toLowerCase().replace(/ё/g, 'е')

function markSyllable(raw, tone) {
  const chars = [...raw.replace(/u:|v/g, 'ü')]
  if (tone < 1 || tone > 4) return chars.join('')
  const found = chars.map((ch, index) => ({ ch, index })).filter(({ ch }) => VOWELS.includes(ch))
  if (!found.length) return chars.join('')
  const letters = found.map(({ ch }) => ch).join('')
  let at = found[found.length - 1].index
  if (letters.includes('a')) at = found.find(({ ch }) => ch === 'a').index
  else if (letters.includes('e')) at = found.find(({ ch }) => ch === 'e').index
  else if (letters.includes('ou')) at = found.find(({ ch }) => ch === 'o').index
  chars[at] = MARKS[tone][VOWELS.indexOf(chars[at])]
  return chars.join('')
}

function marked(query) {
  return compact(query).replace(/([a-zü:v]+?)([0-5])/g, (_, syllable, tone) => markSyllable(syllable, Number(tone)))
}

function tonesFit(query, reading) {
  const q = [...query]
  const r = [...reading]
  if (q.length > r.length) return false
  for (let index = 0; index < q.length; index += 1) {
    const qb = BARE[q[index]] || q[index]
    if (qb !== (BARE[r[index]] || r[index])) return false
    if (BARE[q[index]] && q[index] !== r[index]) return false
  }
  return true
}

function stripTags(text) {
  return text
    .replace(/\[(\/?)(?:i|p|b|ex|ref)\]/g, '')
    .replace(/⟦/g, '[')
    .replace(/⟧/g, ']')
    .replace(/\s+/g, ' ')
    .trim()
}

function meanings(body) {
  const lines = []
  for (const match of body.matchAll(/\[m\d\]([\s\S]*?)\[\/m\]/g)) {
    const line = match[1]
    if (line.includes('[ex]')) continue
    const text = line
      .replace(/\[i\][\s\S]*?\[\/i\]/g, ' ')
      .replace(/\[p\][\s\S]*?\[\/p\]/g, ' ')
      .replace(/\[b\][\s\S]*?\[\/b\]/g, ' ')
      .replace(/\[ref\][\s\S]*?\[\/ref\]/g, ' ')
      .replace(/⟦|⟧/g, '')
      .replace(/^\s*(?:\d+\)|[а-я]\))\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (/\p{Script=Cyrillic}/u.test(text)) lines.push(text)
  }
  return lines
}

function shortOf(body) {
  for (const match of body.matchAll(/\[m\d\]([\s\S]*?)\[\/m\]/g)) {
    if (match[1].includes('[ex]')) continue
    const core = match[1].replace(/\[(i|p|b|ref)\][\s\S]*?\[\/\1\]/g, ' ')
    if ((core.match(/\p{Script=Cyrillic}/gu) || []).length < 3) continue
    const text = stripTags(match[1].replace(/\[(b|p)\][\s\S]*?\[\/\1\]/g, ' ')).replace(/^\s*(?:\d+\)|[а-я]\)|[IVX]+)\s*/i, '').trim()
    if (text) {
      return text.length > 110 ? `${text.slice(0, 108).replace(/[\s,;]+\S*$/, '')}…` : text
    }
  }
  return ''
}

export function loadDict(file) {
  if (!fs.existsSync(file)) return false
  const started = Date.now()
  const text = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8')
  const tokens = new Map()
  for (const row of text.split('\n')) {
    const [hanzi, pinyin, freq, body] = row.split('\t')
    if (!body) continue
    const id = words.length
    words.push({ hanzi, pinyin, freq: Number(freq) || 0, body, short: shortOf(body) })
    const first = [...hanzi][0]
    if (!byFirstChar.has(first)) byFirstChar.set(first, [])
    byFirstChar.get(first).push(id)
    pinyin.split(', ').forEach((reading, order) => {
      const key = bare(compact(reading))
      pinyinKeys.push([key.replace(/ü/g, 'v'), id, compact(reading), order])
      if (key.includes('ü')) pinyinKeys.push([key.replace(/ü/g, 'u'), id, compact(reading), order])
    })
    meanings(body).slice(0, 12).forEach((line, index) => {
      const chunks = ruNorm(line.replace(/\([^)]*\)/g, ' ')).split(/[;,]/).map((chunk) => chunk.replace(/[^\p{L}\s-]/gu, ' ').replace(/\s+/g, ' ').trim())
      for (const token of new Set(ruNorm(line).match(/\p{Script=Cyrillic}[\p{Script=Cyrillic}-]*/gu) || [])) {
        if (token.length < 2) continue
        const quality = (chunks.includes(token) ? 4 : 0) + (index === 0 ? 2 : index < 3 ? 1 : 0)
        const row = tokens.get(token) || []
        const packed = id * 8 + quality
        if (row.length && Math.floor(row[row.length - 1] / 8) === id) {
          if (row[row.length - 1] % 8 < quality) row[row.length - 1] = packed
        } else row.push(packed)
        tokens.set(token, row)
      }
    })
  }
  for (const ids of byFirstChar.values()) ids.sort((a, b) => words[b].freq - words[a].freq)
  pinyinKeys.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  ruTokens = [...tokens.keys()].sort()
  ruPostings = ruTokens.map((token) => Int32Array.from(tokens.get(token)))
  console.log(`dict: ${words.length} статей за ${Date.now() - started} мс`)
  return true
}

function lowerBound(list, prefix, pick) {
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (pick(list[mid]) < prefix) lo = mid + 1
    else hi = mid
  }
  return lo
}

const weight = (id) => Math.log10(words[id].freq + 1)

function searchPinyin(query) {
  const toned = /[0-5āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(query)
  const key = bare(compact(query).replace(/[0-5]/g, '')).replace(/ü|u:/g, 'v')
  if (!/^[a-z]+$/.test(key)) return []
  const tone = toned ? marked(query).replace(/[0-5]/g, '') : ''
  const scores = new Map()
  for (let index = lowerBound(pinyinKeys, key, (row) => row[0]); index < pinyinKeys.length; index += 1) {
    const [rowKey, id, reading, order] = pinyinKeys[index]
    if (!rowKey.startsWith(key)) break
    if (tone && !tonesFit(tone, reading)) continue
    const score = weight(id) + (rowKey === key ? 6 : 0) - (rowKey.length - key.length) * 0.08 - (order ? 1.5 : 0)
    if (!scores.has(id) || scores.get(id) < score) scores.set(id, score)
  }
  return [...scores].sort((a, b) => b[1] - a[1]).map(([id]) => id)
}

function searchHanzi(query) {
  const han = query.replace(/[^\p{Script=Han}]/gu, '')
  if (!han) return []
  const first = [...han][0]
  const starts = (byFirstChar.get(first) || []).filter((id) => words[id].hanzi.startsWith(han))
  const exact = starts.filter((id) => words[id].hanzi === han)
  const rest = starts.filter((id) => words[id].hanzi !== han)
  const result = [...exact, ...rest]
  if (result.length < 40) {
    const inside = []
    for (let id = 0; id < words.length && inside.length < 400; id += 1) {
      if (!words[id].hanzi.startsWith(han) && words[id].hanzi.includes(han)) inside.push(id)
    }
    inside.sort((a, b) => words[b].freq - words[a].freq)
    result.push(...inside)
  }
  return result
}

function tokenHits(part, last) {
  const found = new Map()
  for (let index = lowerBound(ruTokens, part, (token) => token); index < ruTokens.length; index += 1) {
    const token = ruTokens[index]
    if (!token.startsWith(part)) break
    if (!last && token.length > part.length + 3) continue
    const exact = token === part
    for (const packed of ruPostings[index]) {
      const id = Math.floor(packed / 8)
      const score = (packed % 8) + (exact ? 3 : 0) - (token.length - part.length) * 0.05
      if (!found.has(id) || found.get(id) < score) found.set(id, score)
    }
  }
  return found
}

function searchRussian(query) {
  const all = ruNorm(query).match(/\p{Script=Cyrillic}[\p{Script=Cyrillic}-]*/gu) || []
  const parts = all.length > 1 ? all.filter((part) => part.length > 2) : all
  if (!parts.length) return []
  const hits = parts.map((part, index) => tokenHits(part, index === parts.length - 1))
  let scores = hits[0]
  for (const found of hits.slice(1)) {
    const next = new Map()
    for (const [id, score] of found) if (scores.has(id)) next.set(id, scores.get(id) + score)
    scores = next
  }
  if (!scores.size && hits.length > 1) {
    scores = new Map()
    for (const found of hits) for (const [id, score] of found) scores.set(id, (scores.get(id) || 0) + score)
  }
  const phrase = all.join(' ')
  return [...scores]
    .map(([id, score]) => {
      const short = ruNorm(words[id].short)
      const lead = short.replace(/[^\p{L}\s-]/gu, ' ').trim().startsWith(phrase) ? 3 : 0
      return [id, score + lead + weight(id) * 1.3]
    })
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
}

export function dictReady() {
  return words.length > 0
}

export function searchDict(raw, limit = 40) {
  const query = raw.trim().slice(0, 40)
  if (!query) return []
  let ids
  if (HAN.test(query)) ids = searchHanzi(query)
  else if (/\p{Script=Cyrillic}/u.test(query)) ids = searchRussian(query)
  else ids = searchPinyin(query)
  const seen = new Set()
  const result = []
  for (const id of ids) {
    const word = words[id]
    const key = `${word.hanzi}|${word.pinyin}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ hanzi: word.hanzi, pinyin: word.pinyin, short: word.short })
    if (result.length >= limit) break
  }
  return result
}

export function lookupDict(hanzi) {
  const first = [...hanzi][0]
  return (byFirstChar.get(first) || [])
    .filter((id) => words[id].hanzi === hanzi)
    .map((id) => ({ hanzi: words[id].hanzi, pinyin: words[id].pinyin, body: words[id].body }))
}
