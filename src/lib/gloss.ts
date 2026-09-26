import { normalizePinyin } from './pinyin'

export type GlossChar = { hanzi: string; pinyin: string; ru: string }
export type GlossWord = { hanzi: string; pinyin: string; ru: string; note: string; chars: GlossChar[] }
export type GlossPart = { text: string; word?: GlossWord }

const memory = new Map<string, GlossWord[]>()
const pending = new Map<string, Promise<GlossWord[]>>()
const storeKey = (text: string) => `gloss:v2:${text}`

export function cachedGloss(text: string) {
  const hit = memory.get(text)
  if (hit) return hit
  try {
    const raw = localStorage.getItem(storeKey(text))
    if (!raw) return null
    const words = JSON.parse(raw) as GlossWord[]
    memory.set(text, words)
    return words
  } catch {
    return null
  }
}

export function loadGloss(text: string) {
  const hit = cachedGloss(text)
  if (hit) return Promise.resolve(hit)
  const inflight = pending.get(text)
  if (inflight) return inflight
  const run = (async () => {
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'gloss', text }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ошибка')
      const words: GlossWord[] = (Array.isArray(data.words) ? data.words : []).map((row: GlossWord) => ({
        hanzi: row.hanzi,
        pinyin: normalizePinyin(row.pinyin || ''),
        ru: row.ru || '',
        note: row.note || '',
        chars: (Array.isArray(row.chars) ? row.chars : []).map((part) => ({
          hanzi: part.hanzi,
          pinyin: normalizePinyin(part.pinyin || ''),
          ru: part.ru || '',
        })),
      }))
      memory.set(text, words)
      try {
        localStorage.setItem(storeKey(text), JSON.stringify(words))
      } catch {
        // хранилище переполнено — разбор останется только в памяти
      }
      return words
    } finally {
      pending.delete(text)
    }
  })()
  pending.set(text, run)
  return run
}

export function alignGloss(text: string, words: GlossWord[]): GlossPart[] {
  const parts: GlossPart[] = []
  let at = 0
  for (const word of words) {
    const index = text.indexOf(word.hanzi, at)
    if (index < 0) continue
    if (index > at) parts.push({ text: text.slice(at, index) })
    parts.push({ text: word.hanzi, word })
    at = index + word.hanzi.length
  }
  if (at < text.length) parts.push({ text: text.slice(at) })
  return parts
}
