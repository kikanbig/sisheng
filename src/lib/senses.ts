import { normalizePinyin } from './pinyin'

export type Sense = { pinyin: string; ru: string; example: { hanzi: string; pinyin: string; ru: string } | null }

const memory = new Map<string, Sense[]>()
const storeKey = (key: string) => `senses:v1:${key}`

export function cachedSenses(hanzi: string, pinyin: string, ru: string) {
  const key = `${hanzi}|${pinyin}|${ru}`
  const hit = memory.get(key)
  if (hit) return hit
  try {
    const raw = localStorage.getItem(storeKey(key))
    if (!raw) return null
    const senses = JSON.parse(raw) as Sense[]
    memory.set(key, senses)
    return senses
  } catch {
    return null
  }
}

export async function loadSenses(hanzi: string, pinyin: string, ru: string) {
  const hit = cachedSenses(hanzi, pinyin, ru)
  if (hit) return hit
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'senses', hanzi, pinyin, ru }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Ошибка')
  const senses: Sense[] = (Array.isArray(data.senses) ? data.senses : []).map((row: Sense) => ({
    pinyin: normalizePinyin(row.pinyin || ''),
    ru: row.ru,
    example: row.example ? { ...row.example, pinyin: normalizePinyin(row.example.pinyin || '') } : null,
  }))
  const key = `${hanzi}|${pinyin}|${ru}`
  memory.set(key, senses)
  try {
    localStorage.setItem(storeKey(key), JSON.stringify(senses))
  } catch {
    // хранилище переполнено — значения останутся только в памяти
  }
  return senses
}
