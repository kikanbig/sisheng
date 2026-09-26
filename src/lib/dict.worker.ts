/// <reference lib="webworker" />
import { openDB, type IDBPDatabase } from 'idb'

type Manifest = { version: string; count: number; bytes: number; files: { index: string; bodies: string } }
type Hit = { id: number; hanzi: string; pinyin: string; short: string; also?: string }
export type DictRequest =
  | { type: 'status' }
  | { type: 'install' }
  | { type: 'search'; q: string; seq: number }
  | { type: 'entries'; hanzi: string; seq: number }
export type DictReply =
  | { type: 'status'; installed: string | null; ready: boolean; count: number }
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'error'; message: string }
  | { type: 'results'; seq: number; results: Hit[] }
  | { type: 'entries'; seq: number; entries: { hanzi: string; pinyin: string; body: string }[] }

const CHUNK = 2000
const BARE: Record<string, string> = { ā: 'a', á: 'a', ǎ: 'a', à: 'a', ē: 'e', é: 'e', ě: 'e', è: 'e', ī: 'i', í: 'i', ǐ: 'i', ì: 'i', ō: 'o', ó: 'o', ǒ: 'o', ò: 'o', ū: 'u', ú: 'u', ǔ: 'u', ù: 'u', ǖ: 'ü', ǘ: 'ü', ǚ: 'ü', ǜ: 'ü', ḿ: 'm', ń: 'n', ň: 'n', ǹ: 'n' }
const MARKS = ['', 'āēīōūǖ', 'áéíóúǘ', 'ǎěǐǒǔǚ', 'àèìòùǜ']
const VOWELS = 'aeiouü'

let db: Promise<IDBPDatabase> | null = null
let installed: string | null = null
let loading: Promise<void> | null = null

let hanzi: string[] = []
let pinyin: string[] = []
let short: string[] = []
let weight = new Float32Array(0)
const byFirst = new Map<string, number[]>()
let pyKeys: string[] = []
let pyIds = new Int32Array(0)
let pyReadings: string[] = []
let pyOrder = new Uint8Array(0)
let ruTokens: string[] = []
let ruStart = new Int32Array(0)
let ruPacked = new Int32Array(0)
const matchedAlso = new Map<number, string>()

const post = (message: DictReply) => self.postMessage(message)
const bare = (text: string) => [...text].map((ch) => BARE[ch] || ch).join('')
const compact = (text: string) => text.toLowerCase().replace(/[\s’'ʼ-]/g, '')
const ruNorm = (text: string) => text.toLowerCase().replace(/ё/g, 'е')

function store() {
  db ??= openDB('sisheng-dict', 1, {
    upgrade(database) {
      database.createObjectStore('kv')
    },
  })
  return db
}

async function gunzip(response: Response, onBytes: (count: number) => void) {
  const reader = response.body!.getReader()
  const parts: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    onBytes(value.length)
  }
  let blob = new Blob(parts as BlobPart[])
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
  if (head[0] === 0x1f && head[1] === 0x8b) {
    blob = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob()
  }
  return blob.text()
}

async function install() {
  const manifest = (await (await fetch('/dict/manifest.json', { cache: 'no-store' })).json()) as Manifest
  let loaded = 0
  const tick = (count: number) => {
    loaded += count
    post({ type: 'progress', loaded, total: manifest.bytes })
  }
  const get = async (name: string) => {
    const response = await fetch(`/dict/${name}`)
    if (!response.ok || !response.body) throw new Error('Словарь не скачался. Проверь интернет.')
    return gunzip(response, tick)
  }
  const [index, bodies] = await Promise.all([get(manifest.files.index), get(manifest.files.bodies)])
  const database = await store()
  const tx = database.transaction('kv', 'readwrite')
  await tx.store.clear()
  const rows = bodies.split('\n')
  const writes: Promise<unknown>[] = [tx.store.put(index, 'index')]
  for (let from = 0; from < rows.length; from += CHUNK) {
    writes.push(tx.store.put(rows.slice(from, from + CHUNK).join('\n'), `b:${from / CHUNK}`))
  }
  writes.push(tx.store.put(manifest, 'manifest'))
  await Promise.all(writes)
  await tx.done
  installed = manifest.version
  parse(index)
}

function parse(text: string) {
  const split = text.indexOf('\n@@\n')
  const rows = text.slice(0, split).split('\n')
  const count = rows.length
  hanzi = new Array(count)
  pinyin = new Array(count)
  short = new Array(count)
  weight = new Float32Array(count)
  byFirst.clear()
  const keys: [string, number, string, number][] = []
  for (let id = 0; id < count; id += 1) {
    const [h, p, f, s] = rows[id].split('\t')
    hanzi[id] = h
    pinyin[id] = p
    short[id] = s || ''
    weight[id] = Math.log10((Number(f) || 0) + 1)
    const first = h[0] >= '\ud800' && h[0] <= '\udbff' ? h.slice(0, 2) : h[0]
    const list = byFirst.get(first)
    if (list) list.push(id)
    else byFirst.set(first, [id])
    p.split(', ').forEach((reading, order) => {
      const key = bare(compact(reading))
      keys.push([key.replace(/ü/g, 'v'), id, compact(reading), order])
      if (key.includes('ü')) keys.push([key.replace(/ü/g, 'u'), id, compact(reading), order])
    })
  }
  keys.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  pyKeys = keys.map((row) => row[0])
  pyIds = Int32Array.from(keys, (row) => row[1])
  pyReadings = keys.map((row) => row[2])
  pyOrder = Uint8Array.from(keys, (row) => row[3])

  const ru = text.slice(split + 4).split('\n')
  ruTokens = new Array(ru.length)
  ruStart = new Int32Array(ru.length + 1)
  const packed: number[] = []
  ru.forEach((line, index) => {
    const tab = line.indexOf('\t')
    ruTokens[index] = line.slice(0, tab)
    ruStart[index] = packed.length
    let value = 0
    for (const delta of line.slice(tab + 1).split(',')) {
      value += parseInt(delta, 36)
      packed.push(value)
    }
  })
  ruStart[ru.length] = packed.length
  ruPacked = Int32Array.from(packed)
}

async function load() {
  const database = await store()
  const manifest = (await database.get('kv', 'manifest')) as Manifest | undefined
  if (!manifest) return
  const index = (await database.get('kv', 'index')) as string | undefined
  if (!index) return
  installed = manifest.version
  parse(index)
}

function lowerBound(list: string[], prefix: string) {
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (list[mid] < prefix) lo = mid + 1
    else hi = mid
  }
  return lo
}

function markSyllable(raw: string, tone: number) {
  const chars = [...raw.replace(/u:|v/g, 'ü')]
  if (tone < 1 || tone > 4) return chars.join('')
  const found = chars.map((ch, index) => ({ ch, index })).filter(({ ch }) => VOWELS.includes(ch))
  if (!found.length) return chars.join('')
  const letters = found.map(({ ch }) => ch).join('')
  let at = found[found.length - 1].index
  if (letters.includes('a')) at = found.find(({ ch }) => ch === 'a')!.index
  else if (letters.includes('e')) at = found.find(({ ch }) => ch === 'e')!.index
  else if (letters.includes('ou')) at = found.find(({ ch }) => ch === 'o')!.index
  chars[at] = MARKS[tone][VOWELS.indexOf(chars[at])]
  return chars.join('')
}

function tonesFit(query: string, reading: string) {
  const q = [...query]
  const r = [...reading]
  if (q.length > r.length) return false
  for (let index = 0; index < q.length; index += 1) {
    if ((BARE[q[index]] || q[index]) !== (BARE[r[index]] || r[index])) return false
    if (BARE[q[index]] && q[index] !== r[index]) return false
  }
  return true
}

function searchPinyin(query: string) {
  const toned = /[0-5āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(query)
  const key = bare(compact(query).replace(/[0-5]/g, '')).replace(/ü|u:/g, 'v')
  if (!/^[a-z]+$/.test(key)) return []
  const tone = toned
    ? compact(query)
        .replace(/([a-zü:v]+?)([0-5])/g, (_, syllable: string, digit: string) => markSyllable(syllable, Number(digit)))
        .replace(/[0-5]/g, '')
    : ''
  const scores = new Map<number, number>()
  const orders = new Map<number, number>()
  for (let index = lowerBound(pyKeys, key); index < pyKeys.length; index += 1) {
    const rowKey = pyKeys[index]
    if (!rowKey.startsWith(key)) break
    if (tone && !tonesFit(tone, pyReadings[index])) continue
    const id = pyIds[index]
    const score = weight[id] + (rowKey === key ? 6 : 0) - (rowKey.length - key.length) * 0.08 - (pyOrder[index] ? 1.5 : 0)
    if ((scores.get(id) ?? -Infinity) < score) {
      scores.set(id, score)
      orders.set(id, pyOrder[index])
    }
  }
  for (const [id, order] of orders) {
    if (order) matchedAlso.set(id, pinyin[id].split(', ')[order])
  }
  return [...scores].sort((a, b) => b[1] - a[1]).map(([id]) => id)
}

function searchHanzi(query: string) {
  const han = query.replace(/[^\p{Script=Han}]/gu, '')
  if (!han) return []
  const first = [...han][0]
  const starts = (byFirst.get(first) || []).filter((id) => hanzi[id].startsWith(han))
  const result = [...starts.filter((id) => hanzi[id] === han), ...starts.filter((id) => hanzi[id] !== han)]
  if (result.length < 40) {
    for (let id = 0; id < hanzi.length && result.length < 200; id += 1) {
      if (!hanzi[id].startsWith(han) && hanzi[id].includes(han)) result.push(id)
    }
  }
  return result
}

function tokenHits(part: string, last: boolean) {
  const found = new Map<number, number>()
  for (let index = lowerBound(ruTokens, part); index < ruTokens.length; index += 1) {
    const token = ruTokens[index]
    if (!token.startsWith(part)) break
    if (!last && token.length > part.length + 3) continue
    const exact = token === part
    for (let at = ruStart[index]; at < ruStart[index + 1]; at += 1) {
      const id = ruPacked[at] >> 3
      const score = (ruPacked[at] & 7) + (exact ? 3 : 0) - (token.length - part.length) * 0.05
      if ((found.get(id) ?? -Infinity) < score) found.set(id, score)
    }
  }
  return found
}

function searchRussian(query: string) {
  const all = ruNorm(query).match(/\p{Script=Cyrillic}[\p{Script=Cyrillic}-]*/gu) || []
  const parts = all.length > 1 ? all.filter((part) => part.length > 2) : all
  if (!parts.length) return []
  const hits = parts.map((part, index) => tokenHits(part, index === parts.length - 1))
  let scores = hits[0]
  for (const found of hits.slice(1)) {
    const next = new Map<number, number>()
    for (const [id, score] of found) if (scores.has(id)) next.set(id, scores.get(id)! + score)
    scores = next
  }
  if (!scores.size && hits.length > 1) {
    scores = new Map()
    for (const found of hits) for (const [id, score] of found) scores.set(id, (scores.get(id) || 0) + score)
  }
  const phrase = all.join(' ')
  return [...scores]
    .map(([id, score]) => {
      const lead = ruNorm(short[id]).replace(/[^\p{L}\s-]/gu, ' ').trim().startsWith(phrase) ? 3 : 0
      return [id, score + lead + weight[id] * 1.3] as const
    })
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
}

function search(raw: string): Hit[] {
  const query = raw.trim().slice(0, 40)
  if (!query || !hanzi.length) return []
  matchedAlso.clear()
  const ids = /\p{Script=Han}/u.test(query) ? searchHanzi(query) : /\p{Script=Cyrillic}/u.test(query) ? searchRussian(query) : searchPinyin(query)
  const seen = new Set<string>()
  const results: Hit[] = []
  for (const id of ids) {
    const key = `${hanzi[id]}|${pinyin[id]}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({ id, hanzi: hanzi[id], pinyin: pinyin[id], short: short[id], also: matchedAlso.get(id) })
    if (results.length >= 50) break
  }
  return results
}

async function entries(word: string) {
  const ids = (byFirst.get([...word][0]) || []).filter((id) => hanzi[id] === word)
  const database = await store()
  const chunks = new Map<number, string[]>()
  const out = []
  for (const id of ids) {
    const chunk = Math.floor(id / CHUNK)
    if (!chunks.has(chunk)) chunks.set(chunk, (((await database.get('kv', `b:${chunk}`)) as string) || '').split('\n'))
    out.push({ hanzi: hanzi[id], pinyin: pinyin[id], body: chunks.get(chunk)![id % CHUNK] || '' })
  }
  return out
}

function status() {
  post({ type: 'status', installed, ready: hanzi.length > 0, count: hanzi.length })
}

self.onmessage = async (event: MessageEvent<DictRequest>) => {
  const message = event.data
  try {
    if (message.type === 'status') {
      loading ??= load()
      await loading
      status()
    } else if (message.type === 'install') {
      await (loading ??= load())
      loading = install()
      await loading
      status()
    } else if (message.type === 'search') {
      await loading
      post({ type: 'results', seq: message.seq, results: search(message.q) })
    } else if (message.type === 'entries') {
      await loading
      post({ type: 'entries', seq: message.seq, entries: await entries(message.hanzi) })
    }
  } catch (error) {
    loading = null
    post({ type: 'error', message: error instanceof Error ? error.message : 'Словарь не открылся.' })
  }
}
