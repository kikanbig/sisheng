import { useEffect, useRef, useState } from 'react'
import { pickVoice, prefetch, speak, stopSpeech, unlockAudio } from '../lib/audio'
import { VOICES, voiceById } from '../lib/voices'
import { pickScene } from '../lib/scenes'
import { dayWord, todayKey } from '../lib/srs'
import type { Grade } from '../types'
import { useStore } from '../store'
import { AiPanel } from './AiPanel'
import { Phrase } from './Phrase'
import { Ring } from './Ring'
import { Contour, Pinyin, syllableTone } from './Pinyin'
import { SpeedPicker } from './Speed'
import { StrokeQuiz, Strokes } from './Strokes'

const MODE_TITLE = {
  read: 'Чтение',
  listen: 'Слух',
  recall: 'С русского',
  tones: 'Тоны',
  write: 'Черты',
} as const

export function Session() {
  const store = useStore()
  const session = store.session
  const [revealed, setRevealed] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const [hint, setHint] = useState('')
  const [dx, setDx] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [heardId, setHeardId] = useState<string | null>(null)
  const [scene, setScene] = useState(() => pickScene(null))
  const [undoable, setUndoable] = useState(false)
  const undoTimer = useRef(0)
  const drag = useRef<{ x: number; y: number; id: number; active: boolean; example: boolean } | null>(null)
  const dxRef = useRef(0)
  const swiped = useRef(false)
  const swallowClick = useRef(false)
  const swipeAt = useRef(0)
  const voiced = useRef(-1)
  const misses = useRef(0)
  const voices = useRef(new Map<string, string>())

  const item = session && session.index < session.items.length ? session.items[session.index] : null

  const index = session?.index ?? -1
  const [seenIndex, setSeenIndex] = useState(index)
  if (seenIndex !== index) {
    setSeenIndex(index)
    setScene((prev) => pickScene(prev))
    setRevealed(false)
    setPicked(null)
    setHint('')
    setDx(0)
    dxRef.current = 0
    drag.current = null
    misses.current = 0
    setHeardId(null)
  }

  useEffect(() => {
    if (!item || !session) return
    const audioMode = session.mode === 'tones' ? 'tones' : 'vocab'
    for (const upcoming of session.items.slice(session.index + 1, session.index + 3)) {
      prefetch(upcoming.word.hanzi, voiceFor(upcoming.word.id), store.settings.speed, audioMode)
    }
    if (voiced.current === session.index) return
    const should = item.teach || session.mode === 'listen' || session.mode === 'tones' || session.mode === 'write' || session.mode === 'read'
    if (!should) return
    const cardIndex = session.index
    voiced.current = cardIndex
    let live = true
    void speak(item.word.hanzi, voiceFor(item.word.id), store.settings.speed, audioMode)
      .then((kind) => {
        if (!live) return
        if (kind === 'miss') {
          retry(cardIndex)
          return
        }
        setHint(kind === 'device' ? 'Говорит голос устройства. Нейросеть сейчас молчит.' : '')
      })
      .catch(() => {
        if (live) retry(cardIndex)
      })
    return () => {
      live = false
    }
  }, [item?.word.id, item?.teach, session?.index, session?.mode, attempt])

  useEffect(
    () => () => {
      stopSpeech()
      window.clearTimeout(undoTimer.current)
    },
    [],
  )

  const keys = useRef<(event: KeyboardEvent) => void>(() => {})

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      keys.current(event)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function voiceFor(wordId: string) {
    const key = `${wordId}|${store.settings.voice}|${store.settings.mixVoices}`
    if (!voices.current.has(key)) voices.current.set(key, pickVoice(store.settings.voice, store.settings.mixVoices))
    return voices.current.get(key) || store.settings.voice
  }

  function undo() {
    window.clearTimeout(undoTimer.current)
    setUndoable(false)
    stopSpeech()
    voiced.current = -1
    store.undo()
  }

  function offerUndo() {
    setUndoable(true)
    window.clearTimeout(undoTimer.current)
    undoTimer.current = window.setTimeout(() => setUndoable(false), 5000)
  }

  keys.current = (event) => {
    if (event.key === 'Escape') store.endSession()
    if ((event.metaKey || event.ctrlKey) && event.key === 'z') undo()
  }

  if (!session) return null
  if (!item) {
    return <Finish onUndo={session.history.length ? undo : undefined} />
  }

  const word = item.word
  const round = session
  const cardItem = item
  const voice = voiceById(heardId || voiceFor(word.id))
  const audioMode = round.mode === 'tones' ? 'tones' : 'vocab'

  function play(text = word.hanzi, voiceId = voiceFor(word.id)) {
    void speak(text, voiceId, store.settings.speed, audioMode)
      .then((kind) => setHint(kind === 'device' ? 'Говорит голос устройства. Нейросеть сейчас молчит.' : ''))
      .catch(() => setHint('Нажми кнопку звука ещё раз.'))
  }

  function replay(text = word.hanzi) {
    const pool = VOICES.map((item) => item.id)
    const current = heardId || voiceFor(word.id)
    const at = pool.indexOf(current)
    const next = pool[(at + 1) % pool.length]
    setHeardId(next)
    play(text, next)
  }

  function show() {
    setRevealed(true)
    drag.current = null
    dxRef.current = 0
    setDx(0)
    swipeAt.current = performance.now() + 450
    if (round.mode !== 'listen' && round.mode !== 'tones' && round.mode !== 'read') play()
  }

  function retry(cardIndex: number) {
    if (voiced.current !== cardIndex || misses.current >= 2) return
    misses.current += 1
    voiced.current = -1
    setAttempt((value) => value + 1)
  }

  function voiceNext(skipWordId?: string) {
    let nextIndex = round.index + 1
    while (skipWordId && round.items[nextIndex]?.word.id === skipWordId) nextIndex += 1
    const next = round.items[nextIndex]
    if (!next) return
    const target = skipWordId ? round.index + 1 : nextIndex
    voiced.current = target
    void speak(next.word.hanzi, voiceFor(next.word.id), store.settings.speed, round.mode === 'tones' ? 'tones' : 'vocab')
      .then((kind) => {
        if (kind === 'miss') retry(target)
      })
      .catch(() => retry(target))
  }

  function commit(value: Grade) {
    store.checkpoint(word, round.mode)
    voiceNext()
    store.grade(word, round.mode, value)
    if (value === 'again') store.pushAgain(cardItem)
    store.advance()
    offerUndo()
  }

  function learnLater() {
    store.checkpoint(null, round.mode)
    voiceNext()
    store.advance()
    offerUndo()
  }

  function alreadyKnow() {
    store.checkpoint(word, round.mode)
    voiceNext(word.id)
    store.grade(word, round.mode, 'good')
    store.skipAhead(word.id)
    store.advance()
    offerUndo()
  }

  function pickTone(index: number) {
    if (picked !== null) return
    setPicked(index)
    setRevealed(true)
    play(word.choices?.[index]?.hanzi || word.hanzi)
  }

  function finishTone() {
    const correct = picked !== null && word.choices?.[picked]?.hanzi === word.hanzi
    commit(correct ? 'good' : 'again')
  }

  const canSwipe = cardItem.teach || (round.mode !== 'tones' && (revealed || round.mode !== 'write'))

  function settle(moved: number) {
    drag.current = null
    dxRef.current = 0
    setDx(0)
    if (Math.abs(moved) > 88) navigator.vibrate?.(8)
    if (moved > 88) {
      swiped.current = true
      if (cardItem.teach) alreadyKnow()
      else commit('good')
      return
    }
    if (moved < -88) {
      swiped.current = true
      if (cardItem.teach) learnLater()
      else commit('again')
    }
  }

  function swipeStart(event: React.PointerEvent) {
    unlockAudio()
    if (!canSwipe || !event.isPrimary || performance.now() < swipeAt.current) return
    const target = event.target as HTMLElement
    const example = Boolean(target.closest('.example, .phrase'))
    if (!example && target.closest('button, a, input, textarea, canvas, .gloss')) return
    drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId, active: false, example }
  }

  function swipeMove(event: React.PointerEvent) {
    const state = drag.current
    if (!state || event.pointerId !== state.id) return
    const moveX = event.clientX - state.x
    const moveY = event.clientY - state.y
    if (!state.active) {
      if (Math.abs(moveX) < 18 || Math.abs(moveX) < Math.abs(moveY) * 1.4) return
      state.active = true
      try {
        event.currentTarget.setPointerCapture(state.id)
      } catch {
        // указатель уже отпущен — жест всё равно продолжаем
      }
    }
    dxRef.current = moveX
    setDx(moveX)
  }

  function swipeEnd(event: React.PointerEvent) {
    const state = drag.current
    if (!state || event.pointerId !== state.id) return
    const tapped = !state.active
    settle(state.active ? dxRef.current : 0)
    if (!tapped || state.example || revealed || cardItem.teach || round.mode === 'tones' || round.mode === 'write') return
    swallowClick.current = true
    show()
  }

  keys.current = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
      event.preventDefault()
      undo()
      return
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === 'Escape') store.endSession()
    if (cardItem.teach && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault()
      learnLater()
      return
    }
    if (cardItem.teach && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault()
      if (event.key === 'ArrowRight') alreadyKnow()
      else learnLater()
      return
    }
    if (!cardItem.teach && round.mode !== 'tones' && !revealed && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault()
      show()
    }
    if (canSwipe && event.key === 'ArrowRight') {
      event.preventDefault()
      commit('good')
    }
    if (canSwipe && event.key === 'ArrowLeft') {
      event.preventDefault()
      commit('again')
    }
  }

  function onSessionClick(event: React.MouseEvent) {
    if (swiped.current || revealed || cardItem.teach || round.mode === 'tones' || round.mode === 'write') return
    const target = event.target as HTMLElement
    if (target.closest('.session-bar, .speed-row, .undo-toast')) return
    show()
  }

  return (
    <section
      className="session"
      onClick={onSessionClick}
      onClickCapture={(event) => {
        if (!swiped.current && !swallowClick.current) return
        swiped.current = false
        swallowClick.current = false
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerDown={swipeStart}
      onPointerMove={swipeMove}
      onPointerUp={swipeEnd}
      onPointerCancel={swipeEnd}
    >
      <header className="session-bar">
        <button type="button" className="text-btn" onClick={store.endSession}>
          Закрыть
        </button>
        <p>
          {session.title ?? (session.drill ? 'Все слова' : MODE_TITLE[session.mode])} · {session.index + 1}/{session.items.length}
          {item.teach ? ' · знакомство' : ''}
        </p>
        <span className="voice-tag">
          {voice.han} {voice.name}
        </span>
      </header>
      <div className="session-progress" aria-hidden="true">
        <i style={{ width: `${(session.index / session.items.length) * 100}%` }} />
      </div>
      <SpeedPicker value={store.settings.speed} onChange={(speed) => store.updateSettings({ speed })} />

      <article
        key={index}
        className="study-card"
        style={{
          ...(scene ? { ['--scene' as string]: `url('${scene}')` } : {}),
          ...(dx !== 0 && seenIndex === index
            ? { transform: `translateX(${dx}px) rotate(${dx * 0.03}deg)` }
            : {}),
        }}
        >
        {canSwipe && (
          <div className="swipe-tags">
            <span className="swipe-tag yes" style={{ opacity: Math.min(1, Math.max(0, dx) / 88) }}>
              {item.teach ? 'Уже знаю' : 'Реже'}
            </span>
            <span className="swipe-tag no" style={{ opacity: Math.min(1, Math.max(0, -dx) / 88) }}>
              {item.teach ? 'Проверь позже' : 'Ещё раз'}
            </span>
          </div>
        )}
        {item.teach ? (
          <Teach wordHanzi={word.hanzi} onPlay={() => play()} onSpeak={(text) => play(text)} />
        ) : session.mode === 'tones' ? (
          <ToneFace
            hanzi={word.hanzi}
            revealed={revealed}
            picked={picked}
            choices={word.choices || []}
            onPick={pickTone}
            onPlay={() => play()}
            onHear={(hanzi) => play(hanzi)}
          />
        ) : session.mode === 'write' ? (
          revealed ? null : <StrokeQuiz key={word.id} hanzi={word.hanzi} meaning={word.ru} onDone={show} />
        ) : session.mode === 'listen' ? (
          revealed ? null : <ListenFace onPlay={() => play()} />
        ) : session.mode === 'recall' ? (
          revealed ? null : <h2 className="meaning-xl">{word.ru}</h2>
        ) : (
          revealed ? null : <h2 className={faceClass(word.hanzi, 'xl')}>{word.hanzi}</h2>
        )}

        {!item.teach && session.mode !== 'tones' && revealed && (
          <Answer
            word={word}
            onPlay={() => (session.mode === 'read' ? replay() : play())}
            onExample={() => word.example && (session.mode === 'read' ? replay(word.example.hanzi) : play(word.example.hanzi))}
            onSpeak={(text) => play(text)}
          />
        )}

        {item.teach && (
          <Answer
            word={word}
            onPlay={() => play()}
            onExample={() => word.example && play(word.example.hanzi)}
            onSpeak={(text) => play(text)}
            teach
          />
        )}

        {item.teach && word.choices && word.choices.length > 1 && (
          <div className="choice-grid">
            {word.choices.map((choice) => (
              <button
                key={choice.hanzi + choice.pinyin}
                type="button"
                className={choice.hanzi === word.hanzi ? 'choice right' : 'choice'}
                onClick={() => play(choice.hanzi)}
              >
                <Contour tone={syllableTone(choice.pinyin)} />
                <Pinyin text={choice.pinyin} />
                <b className="hanzi">{choice.hanzi}</b>
                <small>{choice.ru}</small>
              </button>
            ))}
          </div>
        )}

        <button type="button" className="play" onClick={() => replay()}>
          <span>Слушать</span>
          <small>
            {voice.name} · {voice.note}
          </small>
        </button>
        {hint && <p className="fine">{hint}</p>}
      </article>

      {undoable && session.history.length > 0 && (
        <button type="button" className="undo-toast" onClick={undo}>
          <UndoIcon />
          Вернуть прошлую карточку
        </button>
      )}

      <footer className="session-foot">
        {item.teach ? (
          <>
            <div className="teach-actions">
              <button type="button" className="ghost" onClick={alreadyKnow}>
                Уже знаю
              </button>
              <button type="button" className="primary" onClick={learnLater}>
                Проверь позже
              </button>
            </div>
            <p className="fine center">Вправо — уже знаю, не спрашивать. Влево — учу, проверь меня в этом занятии.</p>
          </>
        ) : session.mode === 'tones' ? (
          revealed ? (
            <button type="button" className="primary" onClick={finishTone}>
              Дальше
            </button>
          ) : (
            <p className="fine center">Выбери контур, который услышал. Значение спрятано нарочно.</p>
          )
        ) : round.mode === 'write' && !revealed ? (
          <button type="button" className="ghost" onClick={show}>
            Пока не выходит
          </button>
        ) : null}
      </footer>
    </section>
  )
}

function faceClass(text: string, size: 'xl' | 'lg') {
  return `hanzi hanzi-${size}${[...text].length >= 5 ? ' is-long' : ''}`
}

function Teach({ wordHanzi, onPlay, onSpeak }: { wordHanzi: string; onPlay: () => void; onSpeak: (text: string) => void }) {
  return (
    <div className="teach-mark">
      <p className="eyebrow">новое слово · посмотри и услышь</p>
      <button type="button" className={`${faceClass(wordHanzi, 'xl')} bare`} onClick={onPlay}>
        {wordHanzi}
      </button>
      <Phrase text={wordHanzi} onSpeak={onSpeak} chips />
    </div>
  )
}

function ListenFace({ onPlay }: { onPlay: () => void }) {
  return (
    <button type="button" className="listen-orb" onClick={onPlay}>
      <span>听</span>
      <small>только звук</small>
    </button>
  )
}

function ToneFace({
  hanzi,
  choices,
  picked,
  revealed,
  onPick,
  onPlay,
  onHear,
}: {
  hanzi: string
  choices: { hanzi: string; pinyin: string; ru: string }[]
  picked: number | null
  revealed: boolean
  onPick: (index: number) => void
  onPlay: () => void
  onHear: (hanzi: string) => void
}) {
  return (
    <div className="tone-face">
      <button type="button" className="listen-orb small" onClick={onPlay}>
        <span>听</span>
      </button>
      <div className={`choice-grid n${choices.length}`}>
        {choices.map((choice, index) => {
          const tone = syllableTone(choice.pinyin)
          const correct = choice.hanzi === hanzi
          const state = revealed ? (correct ? 'right' : picked === index ? 'wrong' : '') : ''
          return (
            <button key={choice.hanzi + choice.pinyin} type="button" className={`choice ${state}`} onClick={() => (revealed ? onHear(choice.hanzi) : onPick(index))}>
              <Contour tone={tone} />
              <Pinyin text={choice.pinyin} />
              {revealed && (
                <>
                  <b className="hanzi">{choice.hanzi}</b>
                  <small>{choice.ru}</small>
                </>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Answer({
  word,
  onPlay,
  onExample,
  onSpeak,
  teach = false,
}: {
  word: { hanzi: string; pinyin: string; ru: string; pos?: string; note?: string; example?: { hanzi: string; pinyin: string; ru: string } }
  onPlay: () => void
  onExample: () => void
  onSpeak: (text: string) => void
  teach?: boolean
}) {
  return (
    <div className="answer">
      {!teach && (
        <>
          <button type="button" className={`${faceClass(word.hanzi, 'lg')} bare`} onClick={onPlay}>
            {word.hanzi}
          </button>
          <Phrase text={word.hanzi} onSpeak={onSpeak} chips />
        </>
      )}
      <Pinyin text={word.pinyin} className="pinyin-lg" />
      <p className="meaning">
        {word.pos && <span className="pos">{word.pos}</span>}
        {word.ru}
      </p>
      {word.note && <p className="note">{word.note}</p>}
      {word.example && (
        <div className="example">
          <div className="example-head">
            <small>пример · нажми на слово</small>
            <button type="button" className="hear" aria-label="Слушать пример" onClick={onExample}>
              <SpeakerIcon />
            </button>
          </div>
          <Phrase text={word.example.hanzi} onSpeak={onSpeak} />
          <Pinyin text={word.example.pinyin} />
          <span>{word.example.ru}</span>
        </div>
      )}
      <Strokes hanzi={word.hanzi} />
      <AiPanel key={`${word.hanzi}|${word.pinyin}`} word={{ ...word, id: word.hanzi, listId: '', kind: 'vocab' }} />
    </div>
  )
}

function Finish({ onUndo }: { onUndo?: () => void }) {
  const store = useStore()
  const session = store.session!
  const total = session.good + session.again
  const accuracy = total ? Math.round((session.good / total) * 100) : 100
  const minutes = Math.max(1, Math.round((Date.now() - session.startedAt) / 60000))
  const byId = new Map(session.items.map((row) => [row.word.id, row.word]))
  const missed = session.missed.map((id) => byId.get(id)).filter((word): word is NonNullable<typeof word> => Boolean(word))
  const today = store.stats.days[todayKey()] || 0
  const goal = store.settings.dailyGoal

  return (
    <section className="screen done">
      <p className="eyebrow">занятие завершено</p>
      <h1>{accuracy >= 85 ? 'Чисто прошёл.' : accuracy >= 60 ? 'Хорошая работа.' : 'Трудный круг — это нормально.'}</h1>
      <div className="finish-hero">
        <Ring value={accuracy / 100} label={`${accuracy}%`} caption="точность" />
        <ul className="finish-stats">
          <li>
            <b>{session.good}</b>
            <span>удержано</span>
          </li>
          <li>
            <b>{session.again}</b>
            <span>вернулось</span>
          </li>
          <li>
            <b>{minutes} мин</b>
            <span>на занятие</span>
          </li>
          <li>
            <b>
              {today}/{goal}
            </b>
            <span>{today >= goal ? 'цель дня взята' : 'к цели дня'}</span>
          </li>
        </ul>
      </div>
      {store.stats.streak > 0 && (
        <p className="lead">
          Серия {store.stats.streak} {dayWord(store.stats.streak)}. Завтра интервалы сами подскажут, что повторить.
        </p>
      )}
      {missed.length > 0 && (
        <div className="block">
          <div className="block-head">
            <h2>Вернулись в этот раз</h2>
            <p>Нажми, чтобы услышать ещё раз.</p>
          </div>
          <ul className="missed">
            {missed.map((word) => (
              <li key={word.id}>
                <button type="button" onClick={() => void speak(word.hanzi, store.settings.voice, store.settings.speed, 'vocab')}>
                  <b className="hanzi">{word.hanzi}</b>
                  <Pinyin text={word.pinyin} />
                  <span>{word.ru}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="ghost" onClick={() => store.startWords(missed, 'Вернувшиеся')}>
            Прогнать их ещё раз
          </button>
        </div>
      )}
      <button type="button" className="primary xl" onClick={store.endSession}>
        К сегодняшнему
      </button>
      {onUndo && (
        <button type="button" className="text-btn" onClick={onUndo}>
          Вернуть последнюю карточку
        </button>
      )}
    </section>
  )
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 7 4 12l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 12H14a6 6 0 0 1 0 12h-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" transform="translate(0 -6)" />
    </svg>
  )
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10v4h3l4 3V7L7 10H4z" fill="currentColor" />
      <path d="M16 9.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M18.2 7.2a6.5 6.5 0 0 1 0 9.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
