import { useEffect, useState } from 'react'
import { dayWord, todayKey, wordsLabel } from '../lib/srs'
import { useStore } from '../store'
import { VOICES } from '../lib/voices'
import type { Mode } from '../types'
import { Ring } from './Ring'
import { SpeedPicker } from './Speed'

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

const MODES: { id: Mode; title: string; hint: string }[] = [
  { id: 'read', title: 'Чтение', hint: 'иероглиф → смысл' },
  { id: 'listen', title: 'Слух', hint: 'только голос' },
  { id: 'recall', title: 'С русского', hint: 'смысл → слово' },
  { id: 'write', title: 'Черты', hint: 'пиши по одной черте' },
  { id: 'tones', title: 'Тоны', hint: 'контур, не перевод' },
]

export function Today() {
  const store = useStore()
  const [mode, setMode] = useState<Mode>('read')
  const [install, setInstall] = useState<BeforeInstallPromptEvent | null>(null)
  const [empty, setEmpty] = useState(false)
  const counts = store.countsFor(mode)
  const ready = counts.due + counts.fresh
  const hour = new Date().getHours()
  const hello = hour < 5 ? 'Поздний час' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер'
  const goal = store.settings.dailyGoal
  const answered = store.stats.days[todayKey()] || 0
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - index))
    const key = todayKey(date)
    const n = store.stats.days[key] || 0
    return {
      key,
      label: WEEKDAYS[date.getDay()],
      state: n >= goal ? 'full' : n > 0 ? 'some' : index === 6 ? 'today' : 'none',
    }
  })

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setInstall(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  function begin(ahead = 0) {
    const started = store.startSession(mode, ahead)
    setEmpty(!started)
  }

  return (
    <section className="screen">
      <div className="hero">
        <div className="hero-text">
          <p className="eyebrow">{hello}</p>
          <h1>
            {ready === 0
              ? 'На сегодня очередь пуста'
              : counts.due > 0 && counts.fresh > 0
                ? `${counts.due} к повторению и ${counts.fresh} новых`
                : counts.due > 0
                  ? `${counts.due} к повторению`
                  : `${counts.fresh} новых слов`}
          </h1>
        </div>
        <Ring
          className="goal"
          value={answered / goal}
          label={String(answered)}
          caption={answered >= goal ? 'цель взята' : `из ${goal}`}
        />
      </div>
      <div className="week" aria-label="Последние семь дней">
        {week.map((day) => (
          <span key={day.key} className="day" data-state={day.state}>
            <i />
            <small>{day.label}</small>
          </span>
        ))}
        <b className="streak">
          {store.stats.streak > 0 ? `${store.stats.streak} ${dayWord(store.stats.streak)} подряд` : 'серия начнётся сегодня'}
        </b>
      </div>
      <div className="mode-grid">
        {MODES.map((item) => {
          const row = store.countsFor(item.id)
          return (
            <button key={item.id} type="button" data-kind={item.id} className={mode === item.id ? 'mode on' : 'mode'} onClick={() => { setMode(item.id); setEmpty(false) }}>
              <b>{item.title}</b>
              <small>{item.hint}</small>
              <em>{row.due + row.fresh}</em>
            </button>
          )
        })}
      </div>

      <button type="button" className="primary xl" onClick={() => begin(ready > 0 ? 0 : 10)}>
        {ready > 0 ? 'Начать занятие' : 'Повторить заранее'}
      </button>
      {empty && <p className="warn">В этом навыке пока не из чего собрать очередь. Добавь список или слова.</p>}

      <div className="block" data-art="voice">
        <div className="block-head">
          <h2>Голос</h2>
          <p>{mode === 'tones' ? 'Для тонов лучше один и тот же. Смешивай, когда слова уже знакомы.' : 'Шесть тембров путунхуа. Слово всегда читается иероглифами, не пиньинем.'}</p>
        </div>
        <div className="voice-row">
          {VOICES.map((voice) => (
            <button
              key={voice.id}
              type="button"
              className={store.settings.voice === voice.id ? 'chip on' : 'chip'}
              onClick={() => store.updateSettings({ voice: voice.id })}
            >
              <b className="hanzi">{voice.han}</b>
              <span>{voice.name}</span>
              <small>
                {voice.who} · {voice.note}
              </small>
            </button>
          ))}
        </div>
        <div className="row-toggles">
          <button type="button" className={store.settings.mixVoices ? 'toggle on' : 'toggle'} onClick={() => store.updateSettings({ mixVoices: !store.settings.mixVoices })}>
            Менять голос
          </button>
          <SpeedPicker value={store.settings.speed} onChange={(speed) => store.updateSettings({ speed })} />
          <span className="stepper">
            <button type="button" onClick={() => store.updateSettings({ newPerDay: Math.max(4, store.settings.newPerDay - 2) })}>
              −
            </button>
            <b>{store.settings.newPerDay} новых</b>
            <button type="button" onClick={() => store.updateSettings({ newPerDay: Math.min(20, store.settings.newPerDay + 2) })}>
              +
            </button>
          </span>
          <span className="stepper">
            <button type="button" aria-label="Меньше ответов в день" onClick={() => store.updateSettings({ dailyGoal: Math.max(10, goal - 10) })}>
              −
            </button>
            <b>цель {goal}</b>
            <button type="button" aria-label="Больше ответов в день" onClick={() => store.updateSettings({ dailyGoal: Math.min(300, goal + 10) })}>
              +
            </button>
          </span>
        </div>
        <p className="fine">Фразы читаются медленнее отдельных слов. Скорость можно сменить и во время карточки.</p>
      </div>

      {mode !== 'tones' && (
        <div className="block" data-art="scrolls">
          <h2>Списки в очереди</h2>
          <div className="voice-row">
            {store.lists
              .filter((list) => list.id !== 'tones')
              .map((list) => {
                const on = store.settings.studyLists.includes(list.id)
                return (
                  <button
                    key={list.id}
                    type="button"
                    className={on ? 'chip on' : 'chip'}
                    onClick={() => {
                      const studyLists = on
                        ? store.settings.studyLists.filter((id) => id !== list.id)
                        : [...store.settings.studyLists, list.id]
                      store.updateSettings({ studyLists: studyLists.length ? studyLists : [list.id] })
                    }}
                  >
                    <b>{list.name}</b>
                    <small>
                      {store.words.filter((word) => word.listId === list.id).length}{' '}
                      {wordsLabel(store.words.filter((word) => word.listId === list.id).length)}
                    </small>
                  </button>
                )
              })}
          </div>
        </div>
      )}

      {install && (
        <button
          type="button"
          className="text-btn install"
          onClick={() => {
            void install.prompt()
            setInstall(null)
          }}
        >
          Поставить на экран
        </button>
      )}
    </section>
  )
}

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> }
