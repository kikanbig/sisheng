import { useEffect, useRef, useState } from 'react'

function paintColor(variable: string, fallback: string) {
  const probe = document.createElement('span')
  probe.style.color = `var(${variable})`
  document.body.appendChild(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color.startsWith('rgb') ? color : fallback
}

export function Strokes({ hanzi }: { hanzi: string }) {
  const chars = [...hanzi].filter((char) => /\p{Script=Han}/u.test(char)).slice(0, 4)
  const host = useRef<HTMLDivElement>(null)
  const writers = useRef<{ animateCharacter: () => Promise<void> }[]>([])

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
      for (let i = 0; i < chars.length; i += 1) {
        const node = nodes[i]
        if (!node) continue
        try {
          const writer = HanziWriter.create(node, chars[i], {
            width: 96,
            height: 96,
            padding: 6,
            showOutline: true,
            strokeAnimationSpeed: 0.9,
            delayBetweenStrokes: 90,
            strokeColor: ink,
            outlineColor: line,
            radicalColor: '#c2452d',
          })
          writers.current.push(writer)
        } catch {
          node.textContent = chars[i]
        }
      }
    })()
    return () => {
      gone = true
    }
  }, [hanzi])

  if (!chars.length) return null

  return (
    <div className="strokes">
      <div className="stroke-row" ref={host}>
        {chars.map((char, index) => (
          <div key={`${hanzi}-${index}`} data-char={char} className="stroke-box" />
        ))}
      </div>
      <button
        type="button"
        className="text-btn"
        onClick={() => {
          for (const writer of writers.current) void writer.animateCharacter()
        }}
      >
        Порядок черт
      </button>
    </div>
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
  const [note, setNote] = useState('Веди черту в том порядке, в каком она пишется.')
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
    let writer: { cancelQuiz: () => void; quiz: (options?: Record<string, unknown>) => void } | null = null
    ;(async () => {
      const mod = await import('hanzi-writer')
      if (node.dataset.stroke !== stamp) return
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
          showOutline: outline,
          showCharacter: false,
          strokeColor: ink,
          outlineColor: line,
          highlightColor: accent,
          drawingColor: ink,
          drawingWidth: 22,
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
