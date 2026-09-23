import { useEffect, useState } from 'react'
import { wordsLabel } from '../lib/srs'
import { useStore } from '../store'
import { VOICES } from '../lib/voices'
import type { Mode } from '../types'
import { SpeedPicker } from './Speed'

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
      {!store.settings.onboardingDone && (
        <div className="onboarding">
          <p className="eyebrow">как заниматься</p>
          <ol>
            <li>Один экран проверяет одно: чтение, слух, перевод или тон.</li>
            <li>Сначала вспомни сам. Пиньинь и перевод — только после ответа.</li>
            <li>Восемь новых слов в день держатся лучше, чем пятьдесят за вечер.</li>
          </ol>
          <button type="button" className="primary" onClick={() => store.updateSettings({ onboardingDone: true })}>
            Понятно
          </button>
        </div>
      )}

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
      <p className="lead">Один навык за раз. Сначала ответ, потом пиньинь.</p>

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
