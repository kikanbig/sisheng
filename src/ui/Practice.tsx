import { useEffect, useRef, useState } from 'react'
import { speak, unlockAudio } from '../lib/audio'
import { useStore, type PracticeWord } from '../store'
import { Pinyin } from './Pinyin'
import { DRAWING_WIDTH, paintColor } from './Strokes'

type Writer = {
  animateCharacter: () => Promise<void>
  showOutline: (options?: { duration?: number }) => Promise<void>
  cancelQuiz: () => void
  quiz: (options?: Record<string, unknown>) => void
}

/** Прописи поверх любого экрана: закрываются крестиком, «Назад» телефона или Esc, и под ними всё остаётся как было. */
export function PracticeHost() {
  const store = useStore()
  const word = store.practice
  const close = useRef(store.closePractice)
  close.current = store.closePractice
  const pushed = useRef(false)

  useEffect(() => {
    if (!word) return
    if (!pushed.current) {
      history.pushState({ practice: true }, '')
      pushed.current = true
    }
    const onPop = () => {
      pushed.current = false
      close.current()
    }
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation()
      if (event.key === 'Escape') leave()
    }
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [word])

  function leave() {
    if (pushed.current) history.back()
    else close.current()
  }

  if (!word) return null
  return <Practice key={word.hanzi} word={word} onClose={leave} />
}

function Practice({ word, onClose }: { word: PracticeWord; onClose: () => void }) {
  const store = useStore()
  const chars = [...word.hanzi].filter((char) => /\p{Script=Han}/u.test(char))
  const host = useRef<HTMLDivElement>(null)
  const misses = useRef(0)
  const [index, setIndex] = useState(0)
  const [outline, setOutline] = useState(true)
  const [round, setRound] = useState({ n: 0, demo: true })
  const [note, setNote] = useState('')
  const [solved, setSolved] = useState<number[]>([])
  const char = chars[index]
  const finished = solved.includes(index)

  useEffect(() => {
    const node = host.current
    if (!char || !node) return
    const stamp = `${index}:${outline}:${round.n}`
    node.dataset.stroke = stamp
    misses.current = 0
    let writer: Writer | null = null
    const live = () => node.dataset.stroke === stamp
    ;(async () => {
      const mod = await import('hanzi-writer')
      if (!live()) return
      const size = Math.round(node.clientWidth) || 300
      node.replaceChildren()
      try {
        writer = mod.default.create(node, char, {
          width: size,
          height: size,
          padding: Math.round(size * 0.05),
          showOutline: false,
          showCharacter: false,
          strokeAnimationSpeed: 0.5,
          delayBetweenStrokes: 320,
          strokeColor: paintColor('--ink', '#1c1917'),
          outlineColor: paintColor('--line', '#d6d3d1'),
          highlightColor: paintColor('--cinnabar', '#e54d2e'),
          drawingColor: paintColor('--ink', '#1c1917'),
          drawingWidth: DRAWING_WIDTH,
          strokeWidth: 2,
          outlineWidth: 2,
        })
      } catch {
        setNote('Для этого знака нет порядка черт.')
        return
      }
      if (round.demo) {
        setNote('Смотри, как пишется.')
        await writer.animateCharacter()
        if (!live()) return
      }
      if (outline) await writer.showOutline({ duration: round.demo ? 180 : 0 })
      if (!live()) return
      setNote('Пиши по одной черте, с первой.')
      writer.quiz({
        showHintAfterMisses: 2,
        onMistake() {
          misses.current += 1
          setNote(misses.current >= 2 ? 'Подсветил нужную черту — проведи её.' : 'Эта черта другая. Ещё раз.')
        },
        onCorrectStroke(data: { strokesRemaining?: number }) {
          const left = data.strokesRemaining ?? 0
          if (left > 0) setNote(`Верно. Осталось черт: ${left}.`)
        },
        onComplete(data: { totalMistakes?: number }) {
          const total = data.totalMistakes ?? 0
          setNote(total ? `Знак собран, ошибок: ${total}.` : 'Чисто, без единой ошибки.')
          setSolved((list) => (list.includes(index) ? list : [...list, index]))
        },
      })
    })()
    return () => {
      node.dataset.stroke = 'off'
      writer?.cancelQuiz()
    }
  }, [char, index, outline, round])

  function pick(next: number) {
    setIndex(next)
    setSolved((list) => list.filter((item) => item !== next))
    setRound((current) => ({ n: current.n + 1, demo: true }))
  }

  function again(demo: boolean) {
    setSolved((list) => list.filter((item) => item !== index))
    setRound((current) => ({ n: current.n + 1, demo }))
  }

  function hear() {
    unlockAudio()
    void speak(word.hanzi, store.settings.voice, store.settings.speed, 'vocab')
  }

  const nextIndex = index + 1 < chars.length ? index + 1 : null

  return (
    <div className="practice" role="dialog" aria-modal="true" aria-label={`Прописи: ${word.hanzi}`}>
      <div className="practice-sheet">
        <header className="practice-top">
          <button type="button" className="practice-close" onClick={onClose}>
            <BackIcon />
            Назад
          </button>
          <span className="eyebrow">прописи</span>
        </header>

        <button type="button" className="practice-word bare" onClick={hear}>
          <b className="hanzi">{word.hanzi}</b>
          {word.pinyin && <Pinyin text={word.pinyin.split(', ')[0]} />}
          {word.ru && <small>{word.ru}</small>}
        </button>

        {chars.length > 1 && (
          <div className="practice-chars">
            {chars.map((item, at) => (
              <button
                key={`${item}-${at}`}
                type="button"
                className={`chip${at === index ? ' on' : ''}${solved.includes(at) ? ' done' : ''}`}
                onClick={() => pick(at)}
              >
                <span className="hanzi">{item}</span>
              </button>
            ))}
          </div>
        )}

        <div className="quiz-pad practice-pad" ref={host} />
        <p className="fine practice-note">{note}</p>

        {finished ? (
          <div className="practice-actions">
            <button type="button" className="ghost" onClick={() => again(false)}>
              Ещё раз
            </button>
            {nextIndex !== null ? (
              <button type="button" className="primary" onClick={() => pick(nextIndex)}>
                Следующий знак
              </button>
            ) : (
              <button type="button" className="primary" onClick={onClose}>
                Готово
              </button>
            )}
          </div>
        ) : (
          <div className="practice-tools">
            <button type="button" className="speed" onClick={() => again(true)}>
              Показать
            </button>
            <button
              type="button"
              className={outline ? 'speed on' : 'speed'}
              onClick={() => {
                setOutline((value) => !value)
                setRound((current) => ({ n: current.n + 1, demo: false }))
              }}
            >
              {outline ? 'Контур виден' : 'Без контура'}
            </button>
            <button type="button" className="speed" onClick={() => again(false)}>
              Стереть
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
