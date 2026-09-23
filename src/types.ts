export type Mode = 'read' | 'listen' | 'recall' | 'tones' | 'write'
export type Grade = 'again' | 'hard' | 'good' | 'easy'
export type Speed = 'slow' | 'steady' | 'clear' | 'brisk'
export type Theme = 'paper' | 'night'

export type Example = { hanzi: string; pinyin: string; ru: string }
export type Choice = { hanzi: string; pinyin: string; ru: string }

export type Word = {
  id: string
  listId: string
  hanzi: string
  pinyin: string
  ru: string
  pos?: string
  note?: string
  example?: Example
  kind: 'vocab' | 'tone'
  choices?: Choice[]
}

export type WordList = {
  id: string
  name: string
  description: string
  builtin: boolean
  createdAt: number
}

export type CardState = 'new' | 'learning' | 'review'

export type SrsCard = {
  id: string
  wordId: string
  mode: Mode
  ease: number
  interval: number
  reps: number
  lapses: number
  due: number
  state: CardState
  step: number
}

export type Settings = {
  voice: string
  mixVoices: boolean
  speed: Speed
  newPerDay: number
  theme: Theme
  studyLists: string[]
  onboardingDone: boolean
}

export type DayStats = Record<string, number>

export type BackupFile = {
  version: 1
  exportedAt: number
  lists: WordList[]
  words: Word[]
  srs: SrsCard[]
}
