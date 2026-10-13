import { useEffect, useRef, useState } from 'react'
import { lessonDrills } from '../data/drills'
import { workLessons, workTaskLabel, type WorkLesson } from '../data/workbook'
import { speak, unlockAudio } from '../lib/audio'
import { useStore } from '../store'
import { DrillLaunchers, DrillSession } from './Drills'
import { Pinyin } from './Pinyin'
import { DRAWING_WIDTH, paintColor } from './Strokes'

type DrillKind = 'tones' | 'picks' | 'choices' | 'builds'

type Writer = {
  animateCharacter: () => Promise<void>
  cancelQuiz: () => void
  quiz: (options?: Record<string, unknown>) => void
}

export function Workbook() {
  const store = useStore()
  const [openId, setOpenId] = useState(workLessons[0].id)
  const [run, setRun] = useState<{ lessonId: string; index: number } | null>(null)
  const [drill, setDrill] = useState<{ lessonId: string; kind: DrillKind } | null>(null)
  const lesson = workLessons.find((item) => item.id === openId) ?? workLessons[0]
  const running = run ? workLessons.find((item) => item.id === run.lessonId) : null

  if (running && run) {
    return <WriteRun lesson={running} start={run.index} onClose={() => setRun(null)} />
  }

  if (drill) {
    return <DrillSession lessonId={drill.lessonId} kind={drill.kind} onClose={() => setDrill(null)} />
  }

  const doneCopies = workLessons.reduce((sum, item) => sum + copiesOf(item, store.workbook), 0)
  const allCopies = workLessons.reduce((sum, item) => sum + totalCopies(item), 0)

  return (
    <section className="screen">
      <p className="eyebrow">тетрадь · стр. 1–104</p>
      <h1>Прописи по рабочей тетради.</h1>
      <p className="fine">
        Сначала короткие задания урока: тоны или пиньинь, выбор иероглифа, сборка фразы. Потом прописи. По чертам — 4 раза, по частям — 7, слово из списка — один раз.
      </p>
      <p className="workbook-sum">
        {doneCopies} из {allCopies} прописей
      </p>
      <div className="list-switch">
        {workLessons.map((item) => {
          const done = copiesOf(item, store.workbook)
          const all = totalCopies(item)
          return (
            <button key={item.id} type="button" className={item.id === lesson.id ? 'chip on' : 'chip'} onClick={() => setOpenId(item.id)}>
              <b>{item.name}</b>
              <small>
                {done}/{all}
              </small>
            </button>
          )
        })}
      </div>
      <LessonCard
        lesson={lesson}
        progress={store.workbook}
        onDrill={(kind) => {
          const pack = lessonDrills[lesson.id]
          const items = kind === 'tones' ? pack.tones : kind === 'picks' ? pack.picks : kind === 'choices' ? pack.choices : pack.builds
          if (items.every((item) => (store.workbook[item.id] ?? 0) >= 1)) {
            for (const item of items) store.markWorkbook(item.id, 0)
          }
          setDrill({ lessonId: lesson.id, kind })
        }}
        onStart={() => {
          const index = lesson.items.findIndex((item) => (store.workbook[item.id] ?? 0) < item.times)
          if (index < 0) {
            for (const item of lesson.items) store.markWorkbook(item.id, 0)
            setRun({ lessonId: lesson.id, index: 0 })
            return
          }
          setRun({ lessonId: lesson.id, index })
        }}
      />
    </section>
  )
}

function LessonCard({
  lesson,
  progress,
  onStart,
  onDrill,
}: {
  lesson: WorkLesson
  progress: Record<string, number>
  onStart: () => void
  onDrill: (kind: DrillKind) => void
}) {
  const done = copiesOf(lesson, progress)
  const all = totalCopies(lesson)
  const tasks = ['word', 'stroke', 'parts'] as const
  return (
    <div className="block" data-art="ink">
      <div className="block-head">
        <h2>
          {lesson.name} · стр. {lesson.pages}
        </h2>
        <p>{lesson.title}</p>
      </div>
      <DrillLaunchers lessonId={lesson.id} progress={progress} onStart={onDrill} />
      <button type="button" className="primary" onClick={onStart}>
        {done === 0 ? 'Начать прописи' : done >= all ? 'Пройти ещё раз' : 'Продолжить'}
      </button>
      {tasks.map((task) => {
        const items = lesson.items.filter((item) => item.task === task)
        if (!items.length) return null
        return (
          <div key={task} className="workbook-group">
            <p className="eyebrow">{workTaskLabel[task]}</p>
            <ul className="workbook-rows">
              {items.map((item) => {
                const got = Math.min(progress[item.id] ?? 0, item.times)
                return (
                  <li key={item.id} className={got >= item.times ? 'done' : undefined}>
                    <b className="hanzi">{item.hanzi}</b>
                    <Pinyin text={item.pinyin} />
                    <span>{item.ru}</span>
                    {item.hint && <small className="workbook-hint">{item.hint}</small>}
                    <span className="page-mark">стр. {item.page}</span>
                    <span className="workbook-count">
                      {got}/{item.times}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function WriteRun({ lesson, start, onClose }: { lesson: WorkLesson; start: number; onClose: () => void }) {
  const store = useStore()
  const [index, setIndex] = useState(start)
  const [copy, setCopy] = useState(store.workbook[lesson.items[start]?.id] ?? 0)
  const [charAt, setCharAt] = useState(0)
  const [round, setRound] = useState({ n: 0, demo: (store.workbook[lesson.items[start]?.id] ?? 0) === 0 })
  const [note, setNote] = useState('')
  const [finished, setFinished] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const item = lesson.items[index]
  const chars = [...(item?.hanzi ?? '')].filter((char) => /\p{Script=Han}/u.test(char))
  const char = chars[charAt]

  useEffect(() => {
    const node = host.current
    if (!char || !node || !item) return
    const stamp = `${item.id}:${copy}:${charAt}:${round.n}`
    node.dataset.stroke = stamp
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
          strokeAnimationSpeed: 0.6,
          delayBetweenStrokes: 280,
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
        setNote('Сначала смотри порядок черт.')
        await writer.animateCharacter()
        if (!live()) return
      }
      setNote(item.times > 1 ? `Пропись ${copy + 1} из ${item.times}. Пиши с первой черты.` : 'Напиши знак с первой черты.')
      writer.quiz({
        showHintAfterMisses: 2,
        onMistake() {
          setNote('Эта черта другая. Ещё раз.')
        },
        onComplete() {
          if (!live()) return
          const moreChars = charAt + 1 < chars.length
          if (moreChars) {
            setCharAt((value) => value + 1)
            setRound((current) => ({ n: current.n + 1, demo: copy === 0 }))
            return
          }
          const nextCopy = copy + 1
          store.markWorkbook(item.id, nextCopy)
          if (nextCopy < item.times) {
            setCopy(nextCopy)
            setCharAt(0)
            setRound((current) => ({ n: current.n + 1, demo: false }))
            setNote(`Готово ${nextCopy} из ${item.times}. Ещё раз, уже без подсказки.`)
            return
          }
          const nextIndex = index + 1
          if (nextIndex < lesson.items.length) {
            const next = lesson.items[nextIndex]
            const saved = store.workbook[next.id] ?? 0
            setIndex(nextIndex)
            setCopy(saved >= next.times ? 0 : saved)
            setCharAt(0)
            setRound({ n: 0, demo: saved === 0 })
            return
          }
          setFinished(true)
          setNote('Урок написан.')
        },
      })
    })()
    return () => {
      node.dataset.stroke = 'off'
      writer?.cancelQuiz()
    }
  }, [char, item?.id, copy, charAt, round.n, round.demo])

  function hear() {
    if (!item) return
    unlockAudio()
    void speak(item.hanzi, store.settings.voice, store.settings.speed, 'vocab')
  }

  if (!item) return null
  const step = lesson.items.filter((row) => (store.workbook[row.id] ?? 0) >= row.times).length

  return (
    <div className="practice" role="dialog" aria-modal="true" aria-label={`Прописи: ${item.hanzi}`}>
      <div className="practice-sheet">
        <header className="practice-top">
          <button type="button" className="practice-close" onClick={onClose}>
            Назад
          </button>
          <span className="eyebrow">
            {lesson.name} · {step}/{lesson.items.length}
          </span>
        </header>
        <button type="button" className="practice-word bare" onClick={hear}>
          <b className="hanzi">
            {chars.map((sign, at) => (
              <span key={`${sign}-${at}`} className={at === charAt ? 'workbook-now' : undefined}>
                {sign}
              </span>
            ))}
          </b>
          <Pinyin text={item.pinyin} />
          <small>{item.ru}</small>
        </button>
        <p className="workbook-meta">
          {workTaskLabel[item.task]}
          {item.hint ? ` · ${item.hint}` : ''} · <span className="page-mark">стр. {item.page}</span> · {finished ? item.times : copy + 1} из {item.times}
        </p>
        <div className="quiz-pad practice-pad" ref={host} />
        <p className="fine practice-note">{note}</p>
        {finished ? (
          <button type="button" className="primary" onClick={onClose}>
            К уроку
          </button>
        ) : (
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setCharAt(0)
              setRound((current) => ({ n: current.n + 1, demo: true }))
            }}
          >
            Показать черты
          </button>
        )}
      </div>
    </div>
  )
}

function copiesOf(lesson: WorkLesson, progress: Record<string, number>) {
  return lesson.items.reduce((sum, item) => sum + Math.min(progress[item.id] ?? 0, item.times), 0)
}

function totalCopies(lesson: WorkLesson) {
  return lesson.items.reduce((sum, item) => sum + item.times, 0)
}
