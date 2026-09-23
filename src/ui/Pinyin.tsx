import { syllables, toneOf } from '../lib/pinyin'

export function Pinyin({ text, className = '' }: { text: string; className?: string }) {
  const parts = text.split(/(\s+)/)
  return (
    <span className={`pinyin ${className}`.trim()}>
      {parts.map((part, index) =>
        /\s/.test(part) ? (
          <span key={index}>{part}</span>
        ) : (
          <span key={index} className={`tone tone-${toneOf(part)}`}>
            {part}
          </span>
        ),
      )}
    </span>
  )
}

export function toneName(tone: number) {
  return ['', '1-й, ровный', '2-й, восходящий', '3-й, нисходяще-восходящий', '4-й, падающий', 'лёгкий'][tone] || ''
}

export function Contour({ tone }: { tone: number }) {
  return (
    <svg className={`contour tone-${tone}`} viewBox="0 0 54 28" aria-hidden="true">
      {tone === 1 && <path d="M4 14h46" />}
      {tone === 2 && <path d="M6 22 48 6" />}
      {tone === 3 && <path d="M4 8c10 16 28 16 46 0" />}
      {tone === 4 && <path d="M8 6 46 22" />}
      {tone === 5 && <circle cx="27" cy="14" r="3" />}
    </svg>
  )
}

export function syllableTone(pinyin: string) {
  const parts = syllables(pinyin)
  return toneOf(parts[0] || pinyin)
}
