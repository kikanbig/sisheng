import type { Grade, Mode, SrsCard, Word } from '../types'

export const DAY = 24 * 60 * 60 * 1000

export function cardId(wordId: string, mode: Mode): string {
  return `${wordId}:${mode}`
}

export function freshCard(wordId: string, mode: Mode): SrsCard {
  return {
    id: cardId(wordId, mode),
    wordId,
    mode,
    ease: 2.5,
    interval: 0,
    reps: 0,
    lapses: 0,
    due: 0,
    state: 'new',
    step: 0,
  }
}

export function reviewCard(card: SrsCard, grade: Grade, now = Date.now()): SrsCard {
  const ease = card.ease || 2.5
  const next: SrsCard = { ...card }

  if (grade === 'again') {
    next.ease = Math.max(1.3, ease - 0.2)
    next.lapses = (card.lapses || 0) + (card.state === 'review' ? 1 : 0)
    next.reps = 0
    next.state = 'learning'
    next.step = 0
    next.interval = 0
    next.due = now + 60_000
    return next
  }

  const learning = card.state === 'new' || card.state === 'learning'
  if (learning) {
    if (grade === 'hard') {
      next.state = 'learning'
      next.step = 0
      next.interval = 0
      next.due = now + 8 * 60_000
      return next
    }
    if (grade === 'easy') {
      next.state = 'review'
      next.step = 0
      next.ease = ease + 0.15
      next.reps = 1
      next.interval = 3
      next.due = now + 3 * DAY
      return next
    }
    if ((card.step || 0) < 1) {
      next.state = 'learning'
      next.step = 1
      next.interval = 0
      next.due = now + 10 * 60_000
      return next
    }
    next.state = 'review'
    next.step = 0
    next.reps = 1
    next.interval = 1
    next.due = now + DAY
    return next
  }

  const interval = Math.max(1, card.interval || 1)
  if (grade === 'hard') {
    next.ease = Math.max(1.3, ease - 0.15)
    next.interval = Math.max(1, Math.round(interval * 1.2))
  } else if (grade === 'good') {
    next.interval = Math.max(1, Math.round(interval * ease))
    next.reps = (card.reps || 0) + 1
  } else {
    next.ease = ease + 0.15
    next.interval = Math.max(interval + 1, Math.round(interval * ease * 1.3))
    next.reps = (card.reps || 0) + 1
  }
  next.state = 'review'
  next.due = now + next.interval * DAY
  return next
}

export function formatDelay(ms: number): string {
  const abs = Math.max(0, ms)
  const minutes = Math.round(abs / 60000)
  if (minutes < 90) return `${Math.max(1, minutes)} мин`
  const hours = Math.round(minutes / 60)
  if (hours < 36) return `${hours} ч`
  const days = Math.round(hours / 24)
  return `${days} д`
}

export type QueueItem = { word: Word; teach: boolean }

export function buildQueue(opts: {
  words: Word[]
  cards: Map<string, SrsCard>
  mode: Mode
  listIds: string[]
  newBudget: number
  now?: number
  ahead?: number
}): { items: QueueItem[]; due: number; fresh: number } {
  const now = opts.now ?? Date.now()
  const pool = opts.words.filter((word) => {
    if (opts.mode === 'tones') return word.kind === 'tone'
    return word.kind !== 'tone' && opts.listIds.includes(word.listId)
  })

  const learning: Word[] = []
  const due: Word[] = []
  const fresh: Word[] = []
  const later: { word: Word; due: number }[] = []

  for (const word of pool) {
    const card = opts.cards.get(cardId(word.id, opts.mode))
    if (!card || card.state === 'new') {
      fresh.push(word)
      continue
    }
    if (card.due <= now && card.state === 'learning') learning.push(word)
    else if (card.due <= now) due.push(word)
    else later.push({ word, due: card.due })
  }

  learning.sort((a, b) => (opts.cards.get(cardId(a.id, opts.mode))?.due || 0) - (opts.cards.get(cardId(b.id, opts.mode))?.due || 0))
  due.sort((a, b) => (opts.cards.get(cardId(a.id, opts.mode))?.due || 0) - (opts.cards.get(cardId(b.id, opts.mode))?.due || 0))

  const news = fresh.slice(0, Math.max(0, opts.newBudget))
  const items: QueueItem[] = [
    ...news.map((word) => ({ word, teach: true })),
    ...learning.map((word) => ({ word, teach: false })),
    ...due.map((word) => ({ word, teach: false })),
    ...news.map((word) => ({ word, teach: false })),
  ]

  const ahead = opts.ahead ?? 0
  if (ahead > 0 && items.filter((item) => !item.teach).length === 0) {
    later.sort((a, b) => a.due - b.due)
    for (const row of later.slice(0, ahead)) items.push({ word: row.word, teach: false })
  }

  return { items, due: learning.length + due.length, fresh: fresh.length }
}

export function wordsLabel(n: number): string {
  const n10 = n % 10
  const n100 = n % 100
  if (n10 === 1 && n100 !== 11) return 'слово'
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 'слова'
  return 'слов'
}

export function dayWord(n: number): string {
  const n10 = n % 10
  const n100 = n % 100
  if (n10 === 1 && n100 !== 11) return 'день'
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 'дня'
  return 'дней'
}

export function todayKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function yesterdayKey(now = new Date()): string {
  return todayKey(new Date(now.getTime() - DAY))
}
