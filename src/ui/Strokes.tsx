import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

/** Толщина пера в единицах иероглифа (поле 1024): 48 — около 12 px на поле 280 px. */
export const DRAWING_WIDTH = 48

export function paintColor(variable: string, fallback: string) {
  const probe = document.createElement('span')
  probe.style.color = `var(${variable})`
  document.body.appendChild(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  if (color.startsWith('rgb')) return color
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!context) return fallback
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
  return a ? `rgba(${r},${g},${b},${(a / 255).toFixed(2)})` : fallback
}

type StrokeWriter = {
  animateCharacter: () => Promise<unknown>
  showCharacter: (options?: { duration?: number }) => Promise<unknown>
  pauseAnimation: () => Promise<unknown>
}

export function Strokes({ hanzi, pinyin, ru }: { hanzi: string; pinyin?: string; ru?: string }) {
  const store = useStore()
  const chars = [...hanzi].filter((char) => /\p{Script=Han}/u.test(char)).slice(0, 4)
  const host = useRef<HTMLDivElement>(null)
  const writers = useRef<StrokeWriter[]>([])
  const token = useRef(0)
  const [playing, setPlaying] = useState<number | null>(null)

  useEffect(() => {
    let gone = false
    writers.current = []
    const nodes = host.current ? [...host.current.querySelectorAll<HTMLDivElement>('[data-char]')] : []
    nodes.forEach((node) => {
      node.innerHTML = ''
    })
    ;(async () => {
      const mod = await import('hanzi-writer')
      if (gone) return
      const HanziWriter = mod.default
      const ink = paintColor('--ink', '#1c1917')
      const line = paintColor('--line', '#d6d3d1')
      const accent = paintColor('--cinnabar', '#c2452d')
      const ready: StrokeWriter[] = []
      for (let i = 0; i < chars.length; i += 1) {
        const node = nodes[i]
        if (!node) continue
        try {
          ready.push(
            HanziWriter.create(node, chars[i], {
              width: 96,
              height: 96,
              padding: 6,
              showCharacter: true,
              showOutline: false,
              strokeAnimationSpeed: 0.45,
              delayBetweenStrokes: 280,
              strokeColor: ink,
              outlineColor: line,
              radicalColor: accent,
            }),
          )
        } catch {
          node.textContent = chars[i]
        }
      }
      writers.current = ready
    })()
    return () => {
      gone = true
      token.current += 1
    }
  }, [hanzi])

  function play(index: number) {
    const writer = writers.current[index]
    if (!writer) return
    const generation = ++token.current
    setPlaying(index)
    void (async () => {
      for (let i = 0; i < writers.current.length; i += 1) {
        if (i === index) continue
        void writers.current[i].pauseAnimation()
        void writers.current[i].showCharacter({ duration: 0 })
      }
      await writer.animateCharacter()
      if (token.current === generation) setPlaying(null)
    })()
  }

  if (!chars.length) return null

  return (
    <div className="strokes">
      <p className="fine">Порядок черт · красным — ключ, по нему ищут в словаре</p>
      <div className="stroke-row" ref={host}>
        {chars.map((char, index) => (
          <div key={`${hanzi}-${index}`} className="stroke-cell">
            <div data-char={char} className="stroke-box" onClick={() => play(index)} />
            <button type="button" className={playing === index ? 'text-btn stroke-play on' : 'text-btn stroke-play'} onClick={() => play(index)}>
              {playing === index ? 'Пишу…' : 'Как писать'}
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="ghost draw-btn" onClick={() => store.openPractice({ hanzi, pinyin, ru })}>
        <BrushIcon />
        Прописать самому
      </button>
    </div>
  )
}

export function DrawButton({ hanzi, pinyin, ru }: { hanzi: string; pinyin?: string; ru?: string }) {
  const store = useStore()
  if (!/\p{Script=Han}/u.test(hanzi)) return null
  return (
    <button type="button" className="hear" aria-label={`Прописать ${hanzi}`} onClick={() => store.openPractice({ hanzi, pinyin, ru })}>
      <BrushIcon />
    </button>
  )
}

export function BrushIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.5 3.5c-3 1.6-7.4 5.7-9.6 8.6l1.9 1.9c2.9-2.2 7-6.6 8.6-9.6z" fill="currentColor" />
      <path
        d="M9.2 13c-2.3.2-3.6 1.8-3.8 3.9-.1 1.3-.8 2.2-1.9 2.6 3.5 1.2 7.4-.1 7.6-4.6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function StrokeQuiz({
  hanzi,
  meaning,
  onDone,
}: {
  hanzi: string
  meaning: string
  onDone: () => void
}) {
  const chars = [...hanzi].filter((char) => /\p{Script=Han}/u.test(char))
  const host = useRef<HTMLDivElement>(null)
  const misses = useRef(0)
  const done = useRef(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const [index, setIndex] = useState(0)
  const [seen, setSeen] = useState(hanzi)
  const [outline, setOutline] = useState(true)
  const [note, setNote] = useState('Сначала смотри, как черта проводится.')
  if (seen !== hanzi) {
    setSeen(hanzi)
    setIndex(0)
    misses.current = 0
    done.current = false
  }

  useEffect(() => {
    const char = chars[index]
    const node = host.current
    if (!char || !node) return
    const stamp = `${hanzi}:${index}:${outline}`
    node.dataset.stroke = stamp
    let writer: {
      animateCharacter: () => Promise<void>
      showOutline: (options?: { duration?: number }) => Promise<void>
      cancelQuiz: () => void
      quiz: (options?: Record<string, unknown>) => void
    } | null = null
    ;(async () => {
      const mod = await import('hanzi-writer')
      if (node.dataset.stroke !== stamp) return
      setNote('Сначала смотри, как черта проводится.')
      const HanziWriter = mod.default
      const ink = paintColor('--ink', '#1c1917')
      const line = paintColor('--line', '#d6d3d1')
      const accent = paintColor('--cinnabar', '#e54d2e')
      node.replaceChildren()
      try {
        writer = HanziWriter.create(node, char, {
          width: 280,
          height: 280,
          padding: 14,
          showOutline: false,
          showCharacter: false,
          strokeAnimationSpeed: 0.4,
          delayBetweenStrokes: 380,
          strokeColor: ink,
          outlineColor: line,
          highlightColor: accent,
          drawingColor: ink,
          drawingWidth: DRAWING_WIDTH,
          strokeWidth: 2,
          outlineWidth: 2,
        })
      } catch {
        if (!done.current) {
          done.current = true
          onDoneRef.current()
        }
        return
      }
      if (node.dataset.stroke !== stamp) return
      await writer.animateCharacter()
      if (node.dataset.stroke !== stamp) return
      if (outline) await writer.showOutline({ duration: 180 })
      if (node.dataset.stroke !== stamp) return
      setNote('Теперь повтори этот знак. Перо ведётся по одной черте.')
      writer.quiz({
        showHintAfterMisses: 2,
        onMistake() {
          misses.current += 1
          setNote(misses.current >= 2 ? 'Смотри подсвеченную черту и повтори её.' : 'Эта черта другая. Попробуй ещё раз.')
        },
        onCorrectStroke(data: { strokesRemaining?: number }) {
          const left = data.strokesRemaining ?? 0
          setNote(left > 0 ? `Верно. Осталось черт: ${left}.` : 'Знак собран.')
        },
        onComplete() {
          if (index + 1 < chars.length) {
            setIndex((current) => current + 1)
            setNote('Следующий знак. Снова с первой черты.')
            return
          }
          if (done.current) return
          done.current = true
          onDoneRef.current()
        },
      })
    })()
    return () => {
      node.dataset.stroke = 'off'
      writer?.cancelQuiz()
    }
  }, [hanzi, index, outline])

  if (!chars.length) return null

  return (
    <div className="quiz">
      <p className="meaning">{meaning}</p>
      <p className="fine">
        Знак {index + 1} из {chars.length}
      </p>
      <div className="quiz-pad" ref={host} />
      <p className="fine">{note}</p>
      <button type="button" className={outline ? 'toggle on' : 'toggle'} onClick={() => setOutline((value) => !value)}>
        {outline ? 'Контур виден' : 'Без контура'}
      </button>
    </div>
  )
}
