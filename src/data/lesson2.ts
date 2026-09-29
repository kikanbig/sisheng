import type { Word } from '../types'
import { lesson1Words } from './lesson1.ts'

// Страницы PDF 25–62 содержат тот же вводный фонетический урок, из которого
// пользователь ранее собрал «Урок 1». Оставляем его отдельным уроком с
// независимым прогрессом, но не дублируем 185 строк вручную.
export const lesson2Words: Word[] = lesson1Words.map((word, index) => ({
  ...word,
  id: `l2:${String(index + 1).padStart(3, '0')}`,
  listId: 'lesson2',
  example: word.example ? { ...word.example } : undefined,
  choices: word.choices?.map((choice) => ({ ...choice })),
}))
