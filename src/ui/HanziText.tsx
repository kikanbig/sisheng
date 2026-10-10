import { pinyin } from 'pinyin-pro'
import { normalizePinyin } from '../lib/pinyin'
import { Pinyin } from './Pinyin'

type Known = { hanzi: string; pinyin: string }
type Piece = { kind: 'text'; text: string } | { kind: 'zh'; hanzi: string; pinyin: string }

const TONE = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/u
const NEUTRAL = new Set(['a', 'ba', 'de', 'la', 'le', 'ma', 'me', 'men', 'ne', 'r', 'wa', 'ya', 'zhe', 'zi'])
const ALONE: Record<string, string> = { 了: 'le' }

function modelReading(raw: string, hanzi: string) {
  const text = normalizePinyin(raw)
  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length !== [...hanzi].length) return ''
  const marked = tokens.every((token) => TONE.test(token) || NEUTRAL.has(token.toLowerCase()))
  return marked ? text : ''
}

function readingOf(hanzi: string, hint: string, known?: Known) {
  if (known && hanzi === known.hanzi && known.pinyin.trim()) return normalizePinyin(known.pinyin)
  const fromModel = hint ? modelReading(hint, hanzi) : ''
  if (fromModel) return fromModel
  if (ALONE[hanzi]) return ALONE[hanzi]
  return pinyin(hanzi, { toneType: 'symbol', segmentit: 2 }).replace(/\s+/g, ' ').trim()
}

function pieces(text: string, known?: Known): Piece[] {
  const out: Piece[] = []
  const re = /\p{Script=Han}+/gu
  let last = 0
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0
    if (index > last) out.push({ kind: 'text', text: text.slice(last, index) })
    const hanzi = match[0]
    let cursor = index + hanzi.length
    const rest = text.slice(cursor)
    const paren = rest.match(/^\s*[(（]([^)）]{1,48})[)）]/)
    const bare = rest.match(/^\s+([a-zA-Züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ:]+(?:\s+[a-zA-Züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ:]+)*)/)
    let hint = ''
    if (paren && modelReading(paren[1], hanzi)) {
      hint = paren[1]
      cursor += paren[0].length
    } else if (bare && modelReading(bare[1], hanzi)) {
      hint = bare[1]
      cursor += bare[0].length
    }
    out.push({ kind: 'zh', hanzi, pinyin: readingOf(hanzi, hint, known) })
    last = cursor
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}

export function HanziText({ text, known }: { text: string; known?: Known }) {
  const rows = pieces(text, known)
  return (
    <>
      {rows.map((part, index) =>
        part.kind === 'text' ? (
          <span key={index}>{part.text}</span>
        ) : (
          <span key={index} className="zh-inline">
            <b className="hanzi">{part.hanzi}</b>
            <Pinyin text={part.pinyin} />
          </span>
        ),
      )}
    </>
  )
}
