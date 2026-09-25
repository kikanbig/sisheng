import { useEffect, useMemo, useState } from 'react'
import { speak, unlockAudio } from '../lib/audio'
import { normalizePinyin } from '../lib/pinyin'
import { useStore } from '../store'
import type { Word } from '../types'
import { Pinyin } from './Pinyin'

export function Lists() {
  const store = useStore()
  const [openId, setOpenId] = useState('hsk1')
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [hanzi, setHanzi] = useState('')
  const [pinyin, setPinyin] = useState('')
  const [ru, setRu] = useState('')
  const [exH, setExH] = useState('')
  const [exP, setExP] = useState('')
  const [exR, setExR] = useState('')
  const [topic, setTopic] = useState('')
  const [drafts, setDrafts] = useState<Word[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [shown, setShown] = useState(60)

  const list = store.lists.find((item) => item.id === openId) ?? store.lists[0]
  const words = useMemo(() => {
    const q = query.trim().toLowerCase()
    return store.words
      .filter((word) => word.listId === list?.id)
      .filter((word) => !q || `${word.hanzi} ${word.pinyin} ${word.ru}`.toLowerCase().includes(q))
  }, [store.words, list?.id, query])

  useEffect(() => {
    setShown(60)
  }, [openId, query])

  if (!list) return null
  const custom = !list.builtin

  function hear(text: string) {
    unlockAudio()
    void speak(text, store.settings.voice, store.settings.speed, list.id === 'tones' ? 'tones' : 'vocab')
  }

  async function lookup() {
    setBusy('lookup')
    setError('')
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'lookup', hanzi }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ошибка')
      if (typeof data.pinyin === 'string') setPinyin(normalizePinyin(data.pinyin))
      if (typeof data.ru === 'string') setRu(data.ru)
      const example = data.example || {}
      if (typeof example.hanzi === 'string') setExH(example.hanzi)
      if (typeof example.pinyin === 'string') setExP(normalizePinyin(example.pinyin))
      if (typeof example.ru === 'string') setExR(example.ru)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вышло')
    } finally {
      setBusy('')
    }
  }

  function saveWord() {
    if (!/\p{Script=Han}/u.test(hanzi)) {
      setError('В поле слова нужен хотя бы один иероглиф.')
      return
    }
    const word: Word = {
      id: `c:${crypto.randomUUID()}`,
      listId: list.id,
      hanzi: hanzi.trim(),
      pinyin: normalizePinyin(pinyin),
      ru: ru.trim(),
      kind: 'vocab',
      example: exH.trim()
        ? { hanzi: exH.trim(), pinyin: normalizePinyin(exP), ru: exR.trim() }
        : undefined,
    }
    if (!word.pinyin || !word.ru) {
      setError('Нужны пиньинь и русский перевод.')
      return
    }
    store.addWord(word)
    setHanzi('')
    setPinyin('')
    setRu('')
    setExH('')
    setExP('')
    setExR('')
    setError('')
  }

  async function generate() {
    setBusy('generate')
    setError('')
    setDrafts([])
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'generate', topic }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ошибка')
      const rows = Array.isArray(data.words) ? data.words : []
      const next: Word[] = []
      for (const row of rows) {
        if (!row || typeof row.hanzi !== 'string' || !/\p{Script=Han}/u.test(row.hanzi)) continue
        const example = row.example || {}
        next.push({
          id: `c:${crypto.randomUUID()}`,
          listId: list.id,
          hanzi: row.hanzi.trim(),
          pinyin: normalizePinyin(String(row.pinyin || '')),
          ru: String(row.ru || '').trim(),
          kind: 'vocab',
          example:
            example.hanzi && example.ru
              ? { hanzi: String(example.hanzi), pinyin: normalizePinyin(String(example.pinyin || '')), ru: String(example.ru) }
              : undefined,
        })
      }
      setDrafts(next.filter((word) => word.pinyin && word.ru).slice(0, 8))
      if (!next.length) setError('Модель не вернула годных слов. Сформулируй тему иначе.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вышло')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="screen">
      <p className="eyebrow">колоды</p>
      <h1>От урока до HSK 6.</h1>
      <div className="list-switch">
        {store.lists.map((item) => (
          <button key={item.id} type="button" className={item.id === list.id ? 'chip on' : 'chip'} onClick={() => setOpenId(item.id)}>
            <b>{item.name}</b>
            <small>{store.words.filter((word) => word.listId === item.id).length}</small>
          </button>
        ))}
      </div>

      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (!name.trim()) return
          const id = store.addList(name.trim())
          setName('')
          setOpenId(id)
        }}
      >
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Новый список: еда, дорога, работа" maxLength={40} />
        <button type="submit" className="primary">
          Создать
        </button>
      </form>

      <div className="block" data-art="scrolls">
        <div className="block-head">
          <h2>{list.name}</h2>
          <p>{list.description}</p>
        </div>
        {list.id !== 'tones' && words.length > 0 && !query.trim() && (
          <button type="button" className="primary" onClick={() => store.startDrill(list.id)}>
            Все карточки · {store.words.filter((word) => word.listId === list.id && word.kind !== 'tone').length}
          </button>
        )}
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти в списке" />
        <ul className="word-list">
          {words.slice(0, shown).map((word) => (
            <li key={word.id}>
              <div>
                <b className="hanzi">{word.hanzi}</b>
                <Pinyin text={word.pinyin} />
                <span>{word.ru}</span>
              </div>
              <span className="word-actions">
                <button type="button" className="hear" aria-label={`Слушать ${word.hanzi}`} onClick={() => hear(word.hanzi)}>
                  <Speaker />
                </button>
                {word.id.startsWith('c:') && (
                  <button type="button" className="text-btn" onClick={() => store.removeWord(word.id)}>
                    Убрать
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {words.length > shown && (
          <button type="button" className="text-btn" onClick={() => setShown((count) => count + 80)}>
            Ещё {Math.min(80, words.length - shown)} · всего {words.length}
          </button>
        )}
        {custom && (
          <button type="button" className="text-btn danger" onClick={() => { store.removeList(list.id); setOpenId('hsk1') }}>
            Удалить список
          </button>
        )}
      </div>

      {list.id !== 'tones' && (
        <div className="block" data-art="ink">
          <h2>Добавить слово</h2>
          <div className="form-grid">
            <input value={hanzi} onChange={(event) => setHanzi(event.target.value)} placeholder="Иероглифы" maxLength={16} />
            <input value={pinyin} onChange={(event) => setPinyin(event.target.value)} placeholder="nǐ hǎo или ni3 hao3" maxLength={80} />
            <input value={ru} onChange={(event) => setRu(event.target.value)} placeholder="По-русски" maxLength={80} />
            <input value={exH} onChange={(event) => setExH(event.target.value)} placeholder="Пример иероглифами" maxLength={40} />
            <input value={exP} onChange={(event) => setExP(event.target.value)} placeholder="Пиньинь примера" maxLength={80} />
            <input value={exR} onChange={(event) => setExR(event.target.value)} placeholder="Перевод примера" maxLength={120} />
          </div>
          <div className="row-toggles">
            <button type="button" className="primary" onClick={saveWord}>
              В список
            </button>
            <button type="button" className="ghost" disabled={!hanzi.trim() || !!busy} onClick={() => void lookup()}>
              {busy === 'lookup' ? 'Смотрю…' : 'Заполнить по иероглифу'}
            </button>
          </div>
          <p className="fine">Пиньинь можно с цифрами: ma1 ma3. Слоги разделятся сами.</p>
        </div>
      )}

      {custom && (
        <div className="block" data-art="tea">
          <h2>Слова по теме</h2>
          <p>Модель предложит восемь слов. В список они попадут только после твоего согласия.</p>
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (topic.trim()) void generate()
            }}
          >
            <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Например: завтрак в Пекине" maxLength={80} />
            <button type="submit" className="primary" disabled={!!busy}>
              {busy === 'generate' ? 'Собираю…' : 'Предложить'}
            </button>
          </form>
          {drafts.length > 0 && (
            <>
              <ul className="word-list">
                {drafts.map((word) => (
                  <li key={word.id}>
                    <div>
                      <b className="hanzi">{word.hanzi}</b>
                      <Pinyin text={word.pinyin} />
                      <span>{word.ru}</span>
                    </div>
                    <button type="button" className="hear" aria-label={`Слушать ${word.hanzi}`} onClick={() => hear(word.hanzi)}>
                      <Speaker />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  for (const word of drafts) store.addWord(word)
                  setDrafts([])
                  setTopic('')
                }}
              >
                Добавить эти слова
              </button>
            </>
          )}
        </div>
      )}
      {error && <p className="warn">{error}</p>}
    </section>
  )
}

function Speaker() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10v4h3l4 3V7L7 10H4z" fill="currentColor" />
      <path d="M16 9.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M18.2 7.2a6.5 6.5 0 0 1 0 9.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
