import { builtinWords } from '../src/data/catalog.ts'
import { applyTone, normalizePinyin, toneOf } from '../src/lib/pinyin.ts'
import { freshCard, reviewCard } from '../src/lib/srs.ts'

const hsk = builtinWords.filter((word) => word.listId === 'hsk1')
const tones = builtinWords.filter((word) => word.kind === 'tone')
const ids = new Set(builtinWords.map((word) => word.id))

if (hsk.length !== 150) throw new Error(`HSK1 ${hsk.length}, expected 150`)
if (ids.size !== builtinWords.length) throw new Error('duplicate ids')
if (tones.length < 40) throw new Error('tone deck too small')

for (const word of builtinWords) {
  if (!word.hanzi || !word.pinyin || !word.ru) throw new Error(`empty ${word.id}`)
  for (const syllable of word.pinyin.split(/\s+/)) {
    const tone = toneOf(syllable)
    if (tone < 1 || tone > 5) throw new Error(`tone ${word.id} ${syllable}`)
  }
  if (word.kind === 'vocab' && !word.example?.hanzi) throw new Error(`example ${word.id}`)
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

console.log(`ok hsk=${hsk.length} tones=${tones.length}`)
