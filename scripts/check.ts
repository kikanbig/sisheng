import { readFileSync } from 'node:fs'
import { builtinWords } from '../src/data/catalog.ts'
import { applyTone, normalizePinyin, toneOf } from '../src/lib/pinyin.ts'
import { freshCard, reviewCard } from '../src/lib/srs.ts'

const hsk = builtinWords.filter((word) => word.listId === 'hsk1')
const lesson = builtinWords.filter((word) => word.listId === 'lesson1')
const lesson2 = builtinWords.filter((word) => word.listId === 'lesson2')
const tones = builtinWords.filter((word) => word.kind === 'tone')
const ids = new Set(builtinWords.map((word) => word.id))

if (hsk.length !== 150) throw new Error(`HSK1 ${hsk.length}, expected 150`)
if (lesson.length < 180) throw new Error(`lesson1 ${lesson.length}`)
if (!lesson[0]?.hanzi.startsWith('你好')) throw new Error('lesson order')
if (lesson2.length !== 445) throw new Error(`lesson2 ${lesson2.length}, expected 445`)
if (lesson2.filter((word) => word.pos === 'фраза').length !== 149) throw new Error('lesson2 phrases')
const bookLessons: [string, number, number][] = [
  ['lesson3', 90, 30],
  ['lesson4', 98, 37],
  ['lesson5', 110, 46],
  ['lesson6', 105, 42],
  ['lesson7', 114, 45],
  ['lesson8', 110, 46],
  ['lesson9', 110, 42],
  ['lesson10', 116, 45],
  ['lesson11', 130, 56],
]
for (const [id, total, phrases] of bookLessons) {
  const rows = builtinWords.filter((word) => word.listId === id)
  if (rows.length !== total) throw new Error(`${id} ${rows.length}, expected ${total}`)
  const got = rows.filter((word) => word.pos === 'фраза').length
  if (got !== phrases) throw new Error(`${id} phrases ${got}, expected ${phrases}`)
}
if (ids.size !== builtinWords.length) throw new Error('duplicate ids')
if (tones.length < 40) throw new Error('tone deck too small')

for (const word of builtinWords) {
  if (!word.hanzi || !word.pinyin || !word.ru) throw new Error(`empty ${word.id}`)
  for (const syllable of word.pinyin.split(/\s+/)) {
    const tone = toneOf(syllable)
    if (tone < 1 || tone > 5) throw new Error(`tone ${word.id} ${syllable}`)
  }
  if (word.kind === 'vocab' && !word.example?.hanzi) throw new Error(`example ${word.id}`)
  if (word.example?.pinyin) {
    for (const syllable of word.example.pinyin.replace(/[!.?！？。,，]/g, '').split(/\s+/).filter(Boolean)) {
      if (!/\p{Script=Latin}/u.test(syllable)) throw new Error(`example py ${word.id} ${syllable}`)
    }
  }
}

const samples = [
  ['ni3 hao3', 'nǐ hǎo'],
  ['nv3 er2', 'nǚ ér'],
  ['yi1', 'yī'],
  ['bu4', 'bù'],
  ['ma1', 'mā'],
  ['ma3', 'mǎ'],
  ['ma4', 'mà'],
  ['lü4', 'lǜ'],
  ['nü3', 'nǚ'],
]
for (const [input, expected] of samples) {
  const got = normalizePinyin(input)
  if (got !== expected) throw new Error(`pinyin ${input} → ${got}, want ${expected}`)
}
if (applyTone('hao', 3) !== 'hǎo') throw new Error('hao3')
if (toneOf('nǎr') !== 3) throw new Error('nar')
if (toneOf('ge') !== 5) throw new Error('neutral')

let card = freshCard('hsk:爱', 'read')
card = reviewCard(card, 'good', 0)
if (card.state !== 'learning' || card.due !== 10 * 60_000) throw new Error('first good')
card = reviewCard(card, 'good', card.due)
if (card.state !== 'review' || card.interval !== 1) throw new Error('graduate')
card = reviewCard(card, 'again', card.due)
if (card.state !== 'learning') throw new Error('lapse')

const hskRows = JSON.parse(readFileSync(new URL('../src/data/hsk-levels.json', import.meta.url), 'utf8')) as [string, string, string, number][]
if (hskRows.length < 4800) throw new Error(`hsk rows ${hskRows.length}`)
const levels = new Set(hskRows.map((row) => row[3]))
for (const level of [2, 3, 4, 5, 6]) if (!levels.has(level)) throw new Error(`missing hsk ${level}`)
for (const [hanzi, pinyin, ru] of hskRows) {
  if (!hanzi || !pinyin || !ru) throw new Error(`empty hsk row ${hanzi}`)
  for (const syllable of pinyin.split(/\s+/)) {
    const tone = toneOf(syllable)
    if (tone < 1 || tone > 5) throw new Error(`hsk tone ${hanzi} ${syllable}`)
  }
}

const book = bookLessons.map(([id]) => builtinWords.filter((word) => word.listId === id).length).join('+')
console.log(`ok hsk=${hsk.length} lesson=${lesson.length} lesson2=${lesson2.length} book=${book} tones=${tones.length} hsk2to6=${hskRows.length}`)
