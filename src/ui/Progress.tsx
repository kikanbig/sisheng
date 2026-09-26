import { useMemo, useState } from 'react'
import { speak } from '../lib/audio'
import { dayWord, todayKey } from '../lib/srs'
import { useStore } from '../store'
import type { BackupFile, Mode, Word } from '../types'
import { Pinyin } from './Pinyin'

const MODES: Mode[] = ['read', 'listen', 'recall', 'write', 'tones']
const MODE_NAME: Record<Mode, string> = {
  read: 'Чтение',
  listen: 'Слух',
  recall: 'С русского',
  write: 'Черты',
  tones: 'Тоны',
}

export function Progress() {
  const store = useStore()
  const [confirm, setConfirm] = useState(false)
  const [message, setMessage] = useState('')
  const today = todayKey()

  const summary = useMemo(() => {
    const byMode = Object.fromEntries(MODES.map((mode) => [mode, { learning: 0, review: 0, strong: 0 }])) as Record<
      Mode,
      { learning: number; review: number; strong: number }
    >
    for (const card of store.cards) {
      const bucket = byMode[card.mode]
      if (!bucket) continue
      if (card.state === 'learning') bucket.learning += 1
      else if (card.state === 'review') {
        bucket.review += 1
        if (card.interval >= 21) bucket.strong += 1
      }
    }
    return byMode
  }, [store.cards])

  const hard = useMemo(() => {
    const score = new Map<string, number>()
    for (const card of store.cards) {
      const weight = (card.lapses || 0) * 2 + Math.max(0, 2.5 - (card.ease || 2.5)) * 5
      if (weight > 0.5) score.set(card.wordId, (score.get(card.wordId) || 0) + weight)
    }
    const byId = new Map(store.words.map((word) => [word.id, word]))
    return [...score.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => byId.get(id))
      .filter((word): word is Word => Boolean(word) && word!.kind !== 'tone')
      .slice(0, 24)
  }, [store.cards, store.words])

  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - (13 - index))
    const key = todayKey(date)
    return { key, n: store.stats.days[key] || 0 }
  })
  const max = Math.max(1, ...days.map((day) => day.n))
  const studiedWords = new Set(store.cards.map((card) => card.wordId)).size

  return (
    <section className="screen">
      <p className="eyebrow">память</p>
      <h1>
        {store.stats.streak > 0
          ? `Серия ${store.stats.streak} ${dayWord(store.stats.streak)}.`
          : 'Серия ещё не началась.'}
      </h1>
      <div className="stat-grid">
        <article>
          <b>{store.stats.days[today] || 0}</b>
          <span>ответов сегодня</span>
        </article>
        <article>
          <b>{studiedWords}</b>
          <span>слов в работе</span>
        </article>
        <article>
          <b>{store.cards.filter((card) => card.state === 'review' && card.interval >= 21).length}</b>
          <span>интервал от 21 дня</span>
        </article>
      </div>

      <div className="block" data-art="bamboo">
        <h2>Две недели</h2>
        <div className="bars" aria-hidden="true">
          {days.map((day) => (
            <div key={day.key} className={day.key === today ? 'bar today' : 'bar'} style={{ height: `${Math.max(8, (day.n / max) * 100)}%` }} title={`${day.key}: ${day.n}`} />
          ))}
        </div>
        <ul className="mode-stats">
          {MODES.map((mode) => (
            <li key={mode}>
              <b>{MODE_NAME[mode]}</b>
              <span>
                учу {summary[mode].learning} · повтор {summary[mode].review} · крепко {summary[mode].strong}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="block" data-art="ink">
        <div className="block-head">
          <h2>Трудные слова</h2>
          <p>{hard.length ? 'Чаще других возвращались на повтор. Нажми — услышишь.' : 'Пока пусто: ошибок почти не было.'}</p>
        </div>
        {hard.length > 0 && (
          <>
            <ul className="missed">
              {hard.map((word) => (
                <li key={word.id}>
                  <button type="button" onClick={() => void speak(word.hanzi, store.settings.voice, store.settings.speed, 'vocab')}>
                    <b className="hanzi">{word.hanzi}</b>
                    <Pinyin text={word.pinyin} />
                    <span>{word.ru}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="primary" onClick={() => store.startWords(hard, 'Трудные')}>
              Прогнать трудные · {hard.length}
            </button>
          </>
        )}
      </div>

      <div className="row-toggles">
        <button type="button" className="ghost" onClick={() => void store.downloadBackup()}>
          Скачать свои списки
        </button>
        <label className="ghost file">
          Восстановить
          <input
            type="file"
            accept="application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              try {
                const data = JSON.parse(await file.text()) as BackupFile
                await store.restoreBackup(data)
                setMessage('Списки восстановлены.')
              } catch {
                setMessage('Файл не подошёл.')
              }
            }}
          />
        </label>
      </div>
      {message && <p className="fine">{message}</p>}

      {!confirm ? (
        <button type="button" className="text-btn danger" onClick={() => setConfirm(true)}>
          Сбросить прогресс
        </button>
      ) : (
        <div className="row-toggles">
          <button
            type="button"
            className="primary"
            onClick={() => {
              void store.wipeProgress()
              setConfirm(false)
            }}
          >
            Да, обнулить интервалы
          </button>
          <button type="button" className="ghost" onClick={() => setConfirm(false)}>
            Оставить
          </button>
        </div>
      )}
      <p className="fine">Слова и свои списки при сбросе остаются. Стираются только интервалы.</p>
    </section>
  )
}
