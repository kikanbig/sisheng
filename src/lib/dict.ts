import type { DictReply, DictRequest } from './dict.worker'

export type DictHit = { id: number; hanzi: string; pinyin: string; short: string; also?: string }
export type DictEntry = { hanzi: string; pinyin: string; body: string }
export type DictStatus = { installed: string | null; ready: boolean; count: number }
export type DictLine = { level: number; text: string; example: boolean }

type Listener = (reply: DictReply) => void

let worker: Worker | null = null
let seq = 0
const listeners = new Set<Listener>()

function send(message: DictRequest) {
  if (!worker) {
    worker = new Worker(new URL('./dict.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<DictReply>) => {
      for (const listener of listeners) listener(event.data)
    }
  }
  worker.postMessage(message)
}

function once<T extends DictReply['type']>(type: T, match: (reply: Extract<DictReply, { type: T }>) => boolean = () => true) {
  return new Promise<Extract<DictReply, { type: T }>>((resolve, reject) => {
    const listener: Listener = (reply) => {
      if (reply.type === 'error') {
        listeners.delete(listener)
        reject(new Error(reply.message))
      } else if (reply.type === type && match(reply as Extract<DictReply, { type: T }>)) {
        listeners.delete(listener)
        resolve(reply as Extract<DictReply, { type: T }>)
      }
    }
    listeners.add(listener)
  })
}

export async function dictStatus(): Promise<DictStatus> {
  const reply = once('status')
  send({ type: 'status' })
  return reply
}

export async function installDict(onProgress: (loaded: number, total: number) => void): Promise<DictStatus> {
  const progress: Listener = (reply) => {
    if (reply.type === 'progress') onProgress(reply.loaded, reply.total)
  }
  listeners.add(progress)
  void navigator.storage?.persist?.()
  try {
    const reply = once('status')
    send({ type: 'install' })
    return await reply
  } finally {
    listeners.delete(progress)
  }
}

export async function latestDict(): Promise<string | null> {
  try {
    const response = await fetch('/dict/manifest.json', { cache: 'no-store' })
    if (!response.ok) return null
    return ((await response.json()) as { version: string }).version
  } catch {
    return null
  }
}

export async function searchDict(query: string) {
  const id = ++seq
  const reply = once('results', (row) => row.seq === id)
  send({ type: 'search', q: query, seq: id })
  return (await reply).results
}

export async function loadEntries(hanzi: string) {
  const id = ++seq
  const reply = once('entries', (row) => row.seq === id)
  send({ type: 'entries', hanzi, seq: id })
  return (await reply).entries
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
