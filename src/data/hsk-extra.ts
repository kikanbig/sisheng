import type { Word, WordList } from '../types'
import rows from './hsk-levels.json'

type Row = [string, string, string, number]

const LEVELS = [2, 3, 4, 5, 6]

export const extraLists: WordList[] = LEVELS.map((level) => ({
  id: `hsk${level}`,
  name: `HSK ${level}`,
  description:
    level === 6
      ? '2500 слов шестого уровня. Русский — из открытого списка HSK'
      : `Слова, которые добавляются на уровне HSK ${level}`,
  builtin: true,
  createdAt: 0,
}))

export function extraWords(): Word[] {
  return (rows as Row[]).map((row, index) => {
    const [hanzi, pinyin, ru, level] = row
    return {
      id: `hsk${level}:${String(index).padStart(4, '0')}:${hanzi}`,
      listId: `hsk${level}`,
      hanzi,
      pinyin,
      ru,
      kind: 'vocab' as const,
    }
  })
}
