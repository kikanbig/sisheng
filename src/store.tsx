import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { builtinWords } from './data/catalog'
import {
  deleteList,
  deleteWord,
  exportBackup,
  importBackup,
  loadAll,
  resetProgress,
  saveCard,
  saveList,
  saveNewSeen,
  saveSettings,
  saveStats,
  saveWord,
} from './lib/db'
import { buildQueue, cardId, freshCard, reviewCard, todayKey, yesterdayKey, type QueueItem } from './lib/srs'
import type { BackupFile, DayStats, Grade, Mode, Settings, Speed, SrsCard, Word, WordList } from './types'

type Stats = { streak: number; lastStudy: string; days: DayStats }

type Session = {
  items: QueueItem[]
  index: number
  mode: Mode
  again: number
  good: number
  drill?: boolean
}

type Store = {
  ready: boolean
  error: string
  words: Word[]
  lists: WordList[]
  cards: SrsCard[]
  settings: Settings
  stats: Stats
  newSeen: Record<string, number>
  tab: 'today' | 'lists' | 'progress'
  session: Session | null
  setTab: (tab: Store['tab']) => void
  updateSettings: (patch: Partial<Settings>) => void
  countsFor: (mode: Mode) => { due: number; fresh: number }
  startSession: (mode: Mode, ahead?: number) => boolean
  startDrill: (listId: string) => boolean
  endSession: () => void
  grade: (word: Word, mode: Mode, grade: Grade) => void
  pushAgain: (item: QueueItem) => void
  advance: () => void
  addList: (name: string) => string
  removeList: (id: string) => void
  addWord: (word: Word) => void
  removeWord: (id: string) => void
  downloadBackup: () => Promise<void>
  restoreBackup: (file: BackupFile) => Promise<void>
  wipeProgress: () => Promise<void>
}

const Ctx = createContext<Store | null>(null)

export function useStore() {
  const value = useContext(Ctx)
  if (!value) throw new Error('store')
  return value
}

function budgetLeft(newSeen: Record<string, number>, mode: Mode, perDay: number) {
  const used = newSeen[`${todayKey()}:${mode}`] || 0
  return Math.max(0, perDay - used)
}

const wordRank = new Map(builtinWords.map((word, index) => [word.id, index]))
const LIST_RANK = ['lesson1', 'hsk1', 'hsk2', 'hsk3', 'hsk4', 'hsk5', 'hsk6', 'tones']

function studyRank(id: string) {
  const known = wordRank.get(id)
  if (known !== undefined) return known
  const match = id.match(/^hsk(\d):(\d+):/)
  if (match) return 30000 + Number(match[1]) * 100000 + Number(match[2])
  return 900000
}

function byStudyOrder(list: Word[]) {
  return list.slice().sort((a, b) => studyRank(a.id) - studyRank(b.id) || a.hanzi.localeCompare(b.hanzi, 'zh'))
}

function sortLists(lists: WordList[]) {
  return lists.slice().sort((a, b) => {
    const ai = LIST_RANK.indexOf(a.id)
    const bi = LIST_RANK.indexOf(b.id)
    return (ai < 0 ? 40 : ai) - (bi < 0 ? 40 : bi) || a.createdAt - b.createdAt
  })
}

function applyTheme(theme: Settings['theme']) {
  document.documentElement.dataset.theme = theme
  document.documentElement.classList.toggle('dark', theme === 'night')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'night' ? '#191918' : '#f8f7f4')
}

function coerceSpeed(value: string | undefined): Speed {
  if (value === 'slow' || value === 'steady' || value === 'clear' || value === 'brisk') return value
  if (value === 'normal') return 'clear'
  return 'steady'
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [words, setWords] = useState<Word[]>([])
  const [lists, setLists] = useState<WordList[]>([])
  const [cards, setCards] = useState<SrsCard[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [stats, setStats] = useState<Stats>({ streak: 0, lastStudy: '', days: {} })
  const [newSeen, setNewSeen] = useState<Record<string, number>>({})
  const [tab, setTab] = useState<Store['tab']>('today')
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    loadAll()
      .then((data) => {
        setWords(data.words)
        setLists(sortLists(data.lists))
        setCards(data.srs)
        setSettings({ ...data.settings, speed: coerceSpeed(data.settings.speed) })
        setStats(data.stats)
        setNewSeen(data.newSeen)
        applyTheme(data.settings.theme)
        setReady(true)
      })
      .catch(() => setError('Не удалось открыть память браузера. Открой приложение не в приватном окне.'))
  }, [])

  const ordered = useMemo(() => byStudyOrder(words), [words])
  const cardMap = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards])

  const countsFor = (mode: Mode) => {
    if (!settings) return { due: 0, fresh: 0 }
    const queue = buildQueue({
      words: ordered,
      cards: cardMap,
      mode,
      listIds: settings.studyLists,
      newBudget: budgetLeft(newSeen, mode, settings.newPerDay),
    })
    return { due: queue.due, fresh: Math.min(queue.fresh, budgetLeft(newSeen, mode, settings.newPerDay)) }
  }

  const updateSettings = (patch: Partial<Settings>) => {
    if (!settings) return
    const next = { ...settings, ...patch, speed: coerceSpeed((patch.speed ?? settings.speed) as string) }
    setSettings(next)
    applyTheme(next.theme)
    void saveSettings(next)
  }

  const startSession = (mode: Mode, ahead = 0) => {
    if (!settings) return false
    const queue = buildQueue({
      words: ordered,
      cards: cardMap,
      mode,
      listIds: settings.studyLists,
      newBudget: budgetLeft(newSeen, mode, settings.newPerDay),
      ahead,
    })
    if (!queue.items.length) return false
    setSession({ items: queue.items, index: 0, mode, again: 0, good: 0 })
    return true
  }

  const startDrill = (listId: string) => {
    const items = ordered
      .filter((word) => word.listId === listId && word.kind !== 'tone')
      .map((word) => ({ word, teach: false }))
    if (!items.length) return false
    setSession({ items, index: 0, mode: 'read', again: 0, good: 0, drill: true })
    return true
  }

  const rememberStudy = (wasNew: boolean, mode: Mode) => {
    const today = todayKey()
    setStats((current) => {
      const days = { ...current.days, [today]: (current.days[today] || 0) + 1 }
      for (const key of Object.keys(days)) {
        if (Date.now() - new Date(key).getTime() > 40 * 86400000) delete days[key]
      }
      const next = {
        streak: current.lastStudy === today ? current.streak : current.lastStudy === yesterdayKey() ? current.streak + 1 : 1,
        lastStudy: today,
        days,
      }
      void saveStats(next)
      return next
    })
    if (!wasNew) return
    setNewSeen((current) => {
      const key = `${today}:${mode}`
      const next = { ...current, [key]: (current[key] || 0) + 1 }
      void saveNewSeen(next)
      return next
    })
  }

  const grade: Store['grade'] = (word, mode, value) => {
    const existing = cardMap.get(cardId(word.id, mode))
    const wasNew = !existing || existing.state === 'new'
    const next = reviewCard(existing ?? freshCard(word.id, mode), value)
    setCards((current) => [...current.filter((card) => card.id !== next.id), next])
    void saveCard(next)
    rememberStudy(wasNew, mode)
    setSession((current) =>
      current
        ? {
            ...current,
            again: current.again + (value === 'again' ? 1 : 0),
            good: current.good + (value === 'again' ? 0 : 1),
          }
        : current,
    )
  }

  const value: Store = {
    ready,
    error,
    words: ordered,
    lists,
    cards,
    settings: settings ?? {
      voice: 'zh-CN-XiaoxiaoNeural',
      mixVoices: false,
      speed: 'steady',
      newPerDay: 8,
      theme: 'paper',
      studyLists: ['lesson1', 'hsk1'],
      onboardingDone: true,
    },
    stats,
    newSeen,
    tab,
    session,
    setTab,
    updateSettings,
    countsFor,
    startSession,
    startDrill,
    endSession: () => setSession(null),
    grade,
    pushAgain: (item) => {
      setSession((current) => {
        if (!current) return current
        const items = current.items.slice()
        const ahead = items.slice(current.index + 1).filter((row) => row.word.id === item.word.id).length
        if (ahead < 2) items.splice(Math.min(items.length, current.index + 4), 0, { ...item, teach: false })
        return { ...current, items }
      })
    },
    advance: () => setSession((current) => (current ? { ...current, index: current.index + 1 } : current)),
    addList: (name) => {
      const list: WordList = {
        id: `l:${crypto.randomUUID()}`,
        name: name.trim(),
        description: 'Свой список',
        builtin: false,
        createdAt: Date.now(),
      }
      setLists((current) => sortLists([...current, list]))
      void saveList(list)
      if (settings && !settings.studyLists.includes(list.id)) {
        updateSettings({ studyLists: [...settings.studyLists, list.id] })
      }
      return list.id
    },
    removeList: (id) => {
      setLists((current) => current.filter((list) => list.id !== id))
      setWords((current) => current.filter((word) => word.listId !== id))
      setCards((current) => current.filter((card) => words.find((word) => word.id === card.wordId)?.listId !== id))
      if (settings) updateSettings({ studyLists: settings.studyLists.filter((item) => item !== id) })
      void deleteList(id)
    },
    addWord: (word) => {
      setWords((current) => [...current.filter((item) => item.id !== word.id), word])
      void saveWord(word)
    },
    removeWord: (id) => {
      setWords((current) => current.filter((word) => word.id !== id))
      setCards((current) => current.filter((card) => card.wordId !== id))
      void deleteWord(id)
    },
    downloadBackup: async () => {
      const data = await exportBackup()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'sisheng-backup.json'
      link.click()
      URL.revokeObjectURL(url)
    },
    restoreBackup: async (file) => {
      await importBackup(file)
      const data = await loadAll()
      setWords(data.words)
      setLists(data.lists)
      setCards(data.srs)
    },
    wipeProgress: async () => {
      await resetProgress()
      setCards([])
      setStats({ streak: 0, lastStudy: '', days: {} })
      setNewSeen({})
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
