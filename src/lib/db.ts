import { openDB, type IDBPDatabase } from 'idb'
import { builtinLists, builtinWords } from '../data/catalog'
import type { BackupFile, DayStats, Settings, SrsCard, Word, WordList } from '../types'
import { DEFAULT_VOICE } from './voices'

const DB = 'sisheng'
type Schema = {
  words: { key: string; value: Word }
  lists: { key: string; value: WordList }
  srs: { key: string; value: SrsCard }
  kv: { key: string; value: unknown }
  audio: { key: string; value: { blob: Blob; at: number } }
}

export const defaultSettings = (): Settings => ({
  voice: DEFAULT_VOICE,
  mixVoices: false,
  speed: 'steady',
  newPerDay: 8,
  dailyGoal: 30,
  theme: 'paper',
  studyLists: ['lesson1', 'hsk1'],
  onboardingDone: false,
})

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null

async function init(): Promise<IDBPDatabase<Schema>> {
  const db = await openDB<Schema>(DB, 1, {
    upgrade(database) {
      database.createObjectStore('words', { keyPath: 'id' })
      database.createObjectStore('lists', { keyPath: 'id' })
      database.createObjectStore('srs', { keyPath: 'id' })
      database.createObjectStore('kv')
      database.createObjectStore('audio')
    },
  })
  const extra = await import('../data/hsk-extra.ts')
  const tx = db.transaction(['words', 'lists', 'kv'], 'readwrite')
  let lesson1Fresh = false
  const lists = tx.objectStore('lists')
  for (const list of [...builtinLists, ...extra.extraLists]) {
    if (!(await lists.get(list.id))) {
      await lists.put(list)
      if (list.id === 'lesson1') lesson1Fresh = true
    }
  }
  const words = tx.objectStore('words')
  for (const word of builtinWords) {
    if (!(await words.get(word.id))) await words.put(word)
  }
  const seeded = await tx.objectStore('kv').get('seed')
  if (seeded !== 'hsk6-v1') {
    const incoming = extra.extraWords()
    await Promise.all(incoming.map((word) => words.put(word)))
    await tx.objectStore('kv').put('hsk6-v1', 'seed')
  }
  if (lesson1Fresh) {
    const saved = (await tx.objectStore('kv').get('settings')) as Settings | undefined
    if (saved && !saved.studyLists.includes('lesson1')) {
      await tx.objectStore('kv').put({ ...saved, studyLists: ['lesson1', ...saved.studyLists] }, 'settings')
    }
  }
  await tx.done
  return db
}

export function getDb() {
  if (!dbPromise) dbPromise = init()
  return dbPromise
}

export async function loadAll() {
  const db = await getDb()
  const [words, lists, srs, settings, stats, newSeen] = await Promise.all([
    db.getAll('words'),
    db.getAll('lists'),
    db.getAll('srs'),
    db.get('kv', 'settings') as Promise<Settings | undefined>,
    db.get('kv', 'stats') as Promise<{ streak: number; lastStudy: string; days: DayStats } | undefined>,
    db.get('kv', 'newSeen') as Promise<Record<string, number> | undefined>,
  ])
  return {
    words,
    lists,
    srs,
    settings: { ...defaultSettings(), ...(settings ?? {}) },
    stats: stats ?? { streak: 0, lastStudy: '', days: {} },
    newSeen: newSeen ?? {},
  }
}

export async function saveSettings(settings: Settings) {
  const db = await getDb()
  await db.put('kv', settings, 'settings')
}

export async function saveStats(stats: { streak: number; lastStudy: string; days: DayStats }) {
  const db = await getDb()
  await db.put('kv', stats, 'stats')
}

export async function saveNewSeen(map: Record<string, number>) {
  const db = await getDb()
  await db.put('kv', map, 'newSeen')
}

export async function saveCard(card: SrsCard) {
  const db = await getDb()
  await db.put('srs', card)
}

export async function deleteCard(id: string) {
  const db = await getDb()
  await db.delete('srs', id)
}

export async function saveWord(word: Word) {
  const db = await getDb()
  await db.put('words', word)
}

export async function deleteWord(id: string) {
  const db = await getDb()
  const srs = await db.getAll('srs')
  const tx = db.transaction(['words', 'srs'], 'readwrite')
  await tx.objectStore('words').delete(id)
  for (const card of srs) {
    if (card.wordId === id) await tx.objectStore('srs').delete(card.id)
  }
  await tx.done
}

export async function saveList(list: WordList) {
  const db = await getDb()
  await db.put('lists', list)
}

export async function deleteList(id: string) {
  const db = await getDb()
  const words = (await db.getAll('words')).filter((word) => word.listId === id)
  const srs = await db.getAll('srs')
  const ids = new Set(words.map((word) => word.id))
  const tx = db.transaction(['lists', 'words', 'srs'], 'readwrite')
  await tx.objectStore('lists').delete(id)
  for (const word of words) await tx.objectStore('words').delete(word.id)
  for (const card of srs) if (ids.has(card.wordId)) await tx.objectStore('srs').delete(card.id)
  await tx.done
}

export async function resetProgress() {
  const db = await getDb()
  await db.clear('srs')
  await db.put('kv', { streak: 0, lastStudy: '', days: {} }, 'stats')
  await db.put('kv', {}, 'newSeen')
}

export async function cacheAudio(key: string, blob: Blob) {
  const db = await getDb()
  await db.put('audio', { blob, at: Date.now() }, key)
  const all = await db.getAllKeys('audio')
  if (all.length > 160) {
    const rows = await Promise.all(all.map(async (id) => ({ id, at: (await db.get('audio', id))?.at ?? 0 })))
    rows.sort((a, b) => a.at - b.at)
    for (const row of rows.slice(0, rows.length - 140)) await db.delete('audio', row.id)
  }
}

export async function readAudio(key: string) {
  const db = await getDb()
  return (await db.get('audio', key))?.blob
}

export async function exportBackup(): Promise<BackupFile> {
  const data = await loadAll()
  return {
    version: 1,
    exportedAt: Date.now(),
    lists: data.lists.filter((list) => !list.builtin),
    words: data.words.filter((word) => !word.id.startsWith('hsk:') && !word.id.startsWith('tone:')),
    srs: data.srs,
  }
}

export async function importBackup(file: BackupFile) {
  if (file.version !== 1 || !Array.isArray(file.words) || !Array.isArray(file.lists)) {
    throw new Error('Непонятный файл')
  }
  const db = await getDb()
  const tx = db.transaction(['words', 'lists', 'srs'], 'readwrite')
  for (const list of file.lists) {
    if (!list?.id || list.builtin) continue
    if (!(await tx.objectStore('lists').get(list.id))) await tx.objectStore('lists').put(list)
  }
  for (const word of file.words) {
    if (!word?.id || !word.hanzi || !word.listId) continue
    if (!(await tx.objectStore('words').get(word.id))) await tx.objectStore('words').put(word)
  }
  for (const card of file.srs ?? []) {
    if (!card?.id || !card.wordId) continue
    await tx.objectStore('srs').put(card)
  }
  await tx.done
}
