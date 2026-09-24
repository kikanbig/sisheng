import { useEffect, useRef, useState } from 'react'
import { pickVoice, speak, stopSpeech } from '../lib/audio'
import { voiceById } from '../lib/voices'
import { cardId, dayWord, formatDelay, freshCard, reviewCard } from '../lib/srs'
import type { Grade } from '../types'
import { useStore } from '../store'
import { AiPanel } from './AiPanel'
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

const GRADES: { id: Grade; label: string }[] = [
  { id: 'again', label: 'Снова' },
  { id: 'hard', label: 'Трудно' },
  { id: 'good', label: 'Помню' },
  { id: 'easy', label: 'Легко' },
]

export function Session() {
  const store = useStore()
  const session = store.session
  const [revealed, setRevealed] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const [hint, setHint] = useState('')
  const [dx, setDx] = useState(0)
  const drag = useRef<{ x: number; y: number; id: number; active: boolean } | null>(null)
  const swiped = useRef(false)
  const voices = useRef(new Map<string, string>())

  const item = session && session.index < session.items.length ? session.items[session.index] : null

  const index = session?.index ?? -1
  const [seenIndex, setSeenIndex] = useState(index)
  if (seenIndex !== index) {
    setSeenIndex(index)
    setRevealed(false)
    setPicked(null)
    setHint('')
    setDx(0)
    drag.current = null
  }

  useEffect(() => {
    if (!item || !session) return
    const teach = item.teach
    const should = teach || session.mode === 'listen' || session.mode === 'tones' || session.mode === 'write'
    if (!should) return
    let live = true
    void speak(item.word.hanzi, voiceFor(item.word.id), store.settings.speed, session.mode === 'tones' ? 'tones' : 'vocab')
      .then((kind) => {
        if (!live) return
        setHint(kind === 'device' ? 'Говорит голос устройства. Нейросеть сейчас молчит.' : '')
      })
      .catch(() => {
        if (live) setHint('Нажми кнопку звука ещё раз.')
      })
    return () => {
      live = false
      stopSpeech()
    }
  }, [item?.word.id, item?.teach, session?.index, session?.mode])

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

  keys.current = (event) => {
    if (event.key === 'Escape') store.endSession()
  }

  if (!session) return null
  if (!item) {
    return (
      <section className="screen done">
        <p className="eyebrow">занятие</p>
        <h1>На сегодня хватит.</h1>
        <p className="lead">
          Удержано {session.good}. Сразу вернулось {session.again}.
          {store.stats.streak > 0 ? ` Серия ${store.stats.streak} ${dayWord(store.stats.streak)}.` : ''}
        </p>
        <button type="button" className="primary" onClick={store.endSession}>
          К сегодняшнему
        </button>
      </section>
    )
  }

  const word = item.word
  const round = session
  const cardItem = item
  const voice = voiceById(voiceFor(word.id))
  const audioMode = round.mode === 'tones' ? 'tones' : 'vocab'
  const card = store.cards.find((row) => row.id === cardId(word.id, round.mode)) ?? freshCard(word.id, round.mode)

  function play(text = word.hanzi) {
    void speak(text, voiceFor(word.id), store.settings.speed, audioMode)
      .then((kind) => setHint(kind === 'device' ? 'Говорит голос устройства. Нейросеть сейчас молчит.' : ''))
      .catch(() => setHint('Нажми кнопку звука ещё раз.'))
  }

  function show() {
    setRevealed(true)
    if (round.mode !== 'listen' && round.mode !== 'tones') play()
  }

  function commit(value: Grade) {
    store.grade(word, round.mode, value)
    if (value === 'again') store.pushAgain(cardItem)
    store.advance()
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

  const canSwipe = !cardItem.teach && round.mode !== 'tones' && revealed

  function swipeStart(event: React.PointerEvent) {
    if (!canSwipe || !event.isPrimary) return
    drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId, active: false }
  }

  function swipeMove(event: React.PointerEvent) {
    const state = drag.current
    if (!state) return
    const moveX = event.clientX - state.x
    const moveY = event.clientY - state.y
    if (!state.active) {
      if (Math.abs(moveX) < 14 || Math.abs(moveX) < Math.abs(moveY) * 1.2) return
      state.active = true
      try {
        event.currentTarget.setPointerCapture(state.id)
      } catch {
        // указатель уже отпущен — жест всё равно продолжаем
      }
    }
    setDx(moveX)
  }

  function swipeEnd() {
    const state = drag.current
    drag.current = null
    if (!state?.active) return
    swiped.current = true
    if (dx > 88) {
      commit('good')
      return
    }
    if (dx < -88) {
      commit('again')
      return
    }
    setDx(0)
  }

  keys.current = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === 'Escape') store.endSession()
    if (cardItem.teach && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault()
      store.advance()
    }
    if (!cardItem.teach && round.mode !== 'tones' && !revealed && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault()
      show()
    }
    if (!cardItem.teach && round.mode !== 'tones' && revealed && ['1', '2', '3', '4'].includes(event.key)) {
      event.preventDefault()
      commit(GRADES[Number(event.key) - 1].id)
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

  return (
    <section className="session">
      <header className="session-bar">
        <button type="button" className="text-btn" onClick={store.endSession}>
          Закрыть
        </button>
        <p>
          {session.drill ? 'Все слова' : MODE_TITLE[session.mode]} · {session.index + 1}/{session.items.length}
          {item.teach ? ' · знакомство' : ''}
        </p>
        <span className="voice-tag">
          {voice.han} {voice.name}
        </span>
      </header>
      <SpeedPicker value={store.settings.speed} onChange={(speed) => store.updateSettings({ speed })} />

      <article
        className={`study-card${drag.current?.active ? ' swiping' : ''}`}
        style={canSwipe ? { transform: `translateX(${dx}px) rotate(${dx * 0.03}deg)` } : undefined}
        onPointerDown={swipeStart}
        onPointerMove={swipeMove}
        onPointerUp={swipeEnd}
        onPointerCancel={swipeEnd}
        onClickCapture={(event) => {
          if (!swiped.current) return
          swiped.current = false
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        {canSwipe && (
          <div className="swipe-tags">
            <span className="swipe-tag yes" style={{ opacity: Math.min(1, Math.max(0, dx) / 88) }}>
              Помню
            </span>
            <span className="swipe-tag no" style={{ opacity: Math.min(1, Math.max(0, -dx) / 88) }}>
              Снова
            </span>
          </div>
        )}
        {item.teach ? (
          <Teach wordHanzi={word.hanzi} onPlay={() => play()} />
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
          <Answer word={word} onPlay={() => play()} onExample={() => word.example && play(word.example.hanzi)} simple={session.drill} />
        )}

        {item.teach && <Answer word={word} onPlay={() => play()} onExample={() => word.example && play(word.example.hanzi)} teach />}

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

        <button type="button" className="play" onClick={() => play()}>
          <span>Слушать</span>
          <small>
            {voice.name} · {voice.note}
          </small>
        </button>
        {hint && <p className="fine">{hint}</p>}
      </article>

      <footer className="session-foot">
        {item.teach ? (
          <button type="button" className="primary" onClick={store.advance}>
            Запомнил, спросить
          </button>
        ) : session.mode === 'tones' ? (
          revealed ? (
            <button type="button" className="primary" onClick={finishTone}>
              Дальше
            </button>
          ) : (
            <p className="fine center">Выбери контур, который услышал. Значение спрятано нарочно.</p>
          )
        ) : revealed ? (
          session.drill ? (
            <p className="fine center swipe-hint">Вправо — помню, влево — снова. Это запомнится.</p>
          ) : (
            <>
              <div className="grades">
                {GRADES.map((grade) => {
                  const next = reviewCard(card, grade.id)
                  return (
                    <button key={grade.id} type="button" className={`grade ${grade.id}`} onClick={() => commit(grade.id)}>
                      <b>{grade.label}</b>
                      <small>{formatDelay(next.due - Date.now())}</small>
                    </button>
                  )
                })}
              </div>
              <p className="fine center swipe-hint">Или смахни карточку: вправо — помню, влево — снова.</p>
            </>
          )
        ) : round.mode === 'write' ? (
          <button type="button" className="ghost" onClick={show}>
            Пока не выходит
          </button>
        ) : (
          <button type="button" className="primary" onClick={show}>
            Показать ответ
          </button>
        )}
      </footer>
    </section>
  )
}

function faceClass(text: string, size: 'xl' | 'lg') {
  return `hanzi hanzi-${size}${[...text].length >= 5 ? ' is-long' : ''}`
}

function Teach({ wordHanzi, onPlay }: { wordHanzi: string; onPlay: () => void }) {
  return (
    <div className="teach-mark">
      <p className="eyebrow">сначала посмотри и услышь</p>
      <button type="button" className={`${faceClass(wordHanzi, 'xl')} bare`} onClick={onPlay}>
        {wordHanzi}
      </button>
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
  teach = false,
  simple = false,
}: {
  word: { hanzi: string; pinyin: string; ru: string; pos?: string; note?: string; example?: { hanzi: string; pinyin: string; ru: string } }
  onPlay: () => void
  onExample: () => void
  teach?: boolean
  simple?: boolean
}) {
  return (
    <div className="answer">
      {!teach && (
        <button type="button" className={`${faceClass(word.hanzi, 'lg')} bare`} onClick={onPlay}>
          {word.hanzi}
        </button>
      )}
      <Pinyin text={word.pinyin} className="pinyin-lg" />
      <p className="meaning">
        {word.pos && <span className="pos">{word.pos}</span>}
        {word.ru}
      </p>
      {word.note && <p className="note">{word.note}</p>}
      {word.example && (
        <button type="button" className="example" onClick={onExample}>
          <span className="hanzi">{word.example.hanzi}</span>
          <Pinyin text={word.example.pinyin} />
          <span>{word.example.ru}</span>
        </button>
      )}
      {!simple && <Strokes hanzi={word.hanzi} />}
      {!teach && !simple && <AiPanel key={`${word.hanzi}|${word.pinyin}`} word={{ ...word, id: word.hanzi, listId: '', kind: 'vocab' }} />}
    </div>
  )
}
