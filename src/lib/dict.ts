export type DictHit = { hanzi: string; pinyin: string; short: string }
export type DictEntry = { hanzi: string; pinyin: string; body: string }

export type DictLine = { level: number; text: string; example: boolean }

const hits = new Map<string, DictHit[]>()
const entries = new Map<string, DictEntry[]>()

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Словарь не ответил.')
  return data as T
}

export async function searchDict(query: string, signal?: AbortSignal) {
  const key = query.trim().toLowerCase()
  const cached = hits.get(key)
  if (cached) return cached
  const data = await getJson<{ results: DictHit[] }>(`/api/dict?q=${encodeURIComponent(key)}`, signal)
  hits.set(key, data.results)
  return data.results
}

export async function loadEntries(hanzi: string) {
  const cached = entries.get(hanzi)
  if (cached) return cached
  const data = await getJson<{ entries: DictEntry[] }>(`/api/dict/word?h=${encodeURIComponent(hanzi)}`)
  entries.set(hanzi, data.entries)
  return data.entries
}

export function dictLines(body: string): DictLine[] {
  return [...body.matchAll(/\[m(\d)\]([\s\S]*?)\[\/m\]/g)].map((match) => ({
    level: Number(match[1]) || 1,
    text: match[2],
    example: match[2].includes('[ex]'),
  }))
}

export type Piece = { text: string; italic: boolean; label: boolean; bold: boolean; ref: boolean }

export function pieces(text: string): Piece[] {
  const out: Piece[] = []
  const on = { i: false, p: false, b: false, ref: false }
  for (const part of text.replace(/\[\/?ex\]/g, '').split(/(\[\/?(?:i|p|b|ref)\])/)) {
    const tag = part.match(/^\[(\/?)(i|p|b|ref)\]$/)
    if (tag) {
      on[tag[2] as keyof typeof on] = !tag[1]
      continue
    }
    if (!part) continue
    out.push({ text: part.replace(/⟦/g, '[').replace(/⟧/g, ']'), italic: on.i, label: on.p, bold: on.b, ref: on.ref })
  }
  return out
}

export function plainText(text: string) {
  return pieces(text).map((piece) => piece.text).join('').replace(/\s+/g, ' ').trim()
}

/** Пример из БКРС: «去上课 идти на урок» → китайская часть и перевод. */
export function splitExample(text: string) {
  const plain = plainText(text)
  const at = plain.search(/[\p{Script=Cyrillic}]/u)
  if (at <= 0) return { zh: '', ru: plain }
  const zh = plain.slice(0, at).replace(/[\s(（[]+$/u, '').trim()
  if (!/\p{Script=Han}/u.test(zh)) return { zh: '', ru: plain }
  return { zh, ru: plain.slice(zh.length).trim() }
}

/** Короткое значение для карточки: первые смыслы до ~40 знаков. */
export function cardMeaning(short: string) {
  const chunks = short.replace(/\([^)]*\)/g, '').split(/[;,]/).map((chunk) => chunk.trim()).filter(Boolean)
  let out = ''
  for (const chunk of chunks) {
    const next = out ? `${out}, ${chunk}` : chunk
    if (next.length > 40 && out) break
    out = next
  }
  return out || short.slice(0, 40)
}
