import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { speak, unlockAudio } from '../lib/audio'
import { revealOpened } from '../lib/reveal'
import { normalizePinyin } from '../lib/pinyin'
import { useStore } from '../store'
import type { Word } from '../types'
import { AiPanel } from './AiPanel'
import { Phrase } from './Phrase'
import { Pinyin } from './Pinyin'
import { DrawButton, Strokes } from './Strokes'

export function Lists() {
  const store = useStore()
  const [openId, setOpenId] = useState('hsk1')
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [entry, setEntry] = useState('')
  const [topic, setTopic] = useState('')
  const [drafts, setDrafts] = useState<Word[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [shown, setShown] = useState(60)
  const [openWord, setOpenWord] = useState<string | null>(null)
  const rows = useRef(new Map<string, HTMLLIElement>())

  const fav = openId === 'fav'
  const list = store.lists.find((item) => item.id === openId) ?? (fav ? undefined : store.lists[0])
  const favoriteIds = useMemo(() => new Set(store.favorites), [store.favorites])
  const words = useMemo(() => {
    const q = query.trim().toLowerCase()
    return store.words
      .filter((word) => (fav ? favoriteIds.has(word.id) : word.listId === list?.id))
      .filter((word) => !q || `${word.hanzi} ${word.pinyin} ${word.ru}`.toLowerCase().includes(q))
  }, [store.words, fav, favoriteIds, list?.id, query])

  useEffect(() => {
    setShown(60)
  }, [openId, query])

  useLayoutEffect(() => {
    if (!openWord) return
    const node = rows.current.get(openWord)
    if (node) revealOpened(node)
  }, [openWord])

  if (!fav && !list) return null
  const custom = !!list && !list.builtin

  function hear(text: string) {
    unlockAudio()
    void speak(text, store.settings.voice, store.settings.speed, list?.id === 'tones' ? 'tones' : 'vocab')
  }

  function takeWords(rows: unknown) {
    const listRows = Array.isArray(rows) ? rows : []
    const next: Word[] = []
    for (const row of listRows) {
      if (!row || typeof row !== 'object') continue
      const item = row as { hanzi?: unknown; pinyin?: unknown; ru?: unknown; example?: { hanzi?: unknown; pinyin?: unknown; ru?: unknown } }
      if (typeof item.hanzi !== 'string' || !/\p{Script=Han}/u.test(item.hanzi)) continue
      const example = item.example || {}
      const word: Word = {
        id: `c:${crypto.randomUUID()}`,
        listId: list!.id,
        hanzi: item.hanzi.trim(),
        pinyin: normalizePinyin(String(item.pinyin || '')),
        ru: String(item.ru || '').trim(),
        kind: 'vocab',
        example:
          typeof example.hanzi === 'string' && example.hanzi.trim() && typeof example.ru === 'string' && example.ru.trim()
            ? { hanzi: example.hanzi.trim(), pinyin: normalizePinyin(String(example.pinyin || '')), ru: example.ru.trim() }
            : undefined,
      }
      if (word.pinyin && word.ru) next.push(word)
    }
    return next.slice(0, 8)
  }

  async function addEntry(event: FormEvent) {
    event.preventDefault()
    const query = entry.trim()
    if (!query) return
    setBusy('lookup')
    setError('')
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'lookup', query }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ошибка')
      const [word] = takeWords([data])
      if (!word) throw new Error('Не разобрал слово. Напиши иероглиф или пиньинь ещё раз.')
      store.addWord(word)
      setEntry('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вышло')
    } finally {
      setBusy('')
    }
  }

  async function scanPhoto(file: File | undefined) {
    if (!file) return
    setBusy('scan')
    setError('')
    try {
      const image = await shrinkPhoto(file)
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'scan', image }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ошибка')
      const words = takeWords(data.words)
      if (!words.length) throw new Error('На фото не вижу китайского слова.')
      for (const word of words) store.addWord(word)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вышло')
    } finally {
      setBusy('')
    }
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
          listId: list!.id,
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
        <button type="button" className={fav ? 'chip on' : 'chip'} onClick={() => setOpenId('fav')}>
          <b>Избранное</b>
          <small>{store.favorites.length}</small>
        </button>
        {store.lists.map((item) => (
          <button key={item.id} type="button" className={!fav && item.id === list?.id ? 'chip on' : 'chip'} onClick={() => setOpenId(item.id)}>
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
          <h2>{fav ? 'Избранное' : list!.name}</h2>
          <p>{fav ? 'Слова и фразы, которые ты отметил звёздочкой.' : list!.description}</p>
        </div>
        {fav && words.length === 0 && <p className="fine">В уроках нажми звёздочку у слова или фразы — они соберутся здесь.</p>}
        {!fav && list!.id !== 'tones' && words.length > 0 && !query.trim() && (
          <button type="button" className="primary" onClick={() => store.startDrill(list!.id)}>
            Все карточки · {store.words.filter((word) => word.listId === list!.id && word.kind !== 'tone').length}
          </button>
        )}
        {fav && words.length > 0 && !query.trim() && (
          <button type="button" className="primary" onClick={() => store.startWords(words, 'Избранное')}>
            Учить избранное · {words.length}
          </button>
        )}
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти в списке" />
        <ul className="word-list">
          {words.slice(0, shown).map((word) => (
            <li
              key={word.id}
              ref={(node) => {
                if (node) rows.current.set(word.id, node)
                else rows.current.delete(word.id)
              }}
              className={openWord === word.id ? 'open' : undefined}
            >
              <button
                type="button"
                className="word-main"
                aria-expanded={openWord === word.id}
                onClick={() => setOpenWord(openWord === word.id ? null : word.id)}
              >
                <b className="hanzi">{word.hanzi}</b>
                <Pinyin text={word.pinyin} />
                <span>{word.ru}</span>
              </button>
              <span className="word-actions">
                {pageOf(word.note) && <span className="page-mark">стр. {pageOf(word.note)}</span>}
                <button
                  type="button"
                  className={favoriteIds.has(word.id) ? 'star on' : 'star'}
                  aria-pressed={favoriteIds.has(word.id)}
                  aria-label={favoriteIds.has(word.id) ? `Убрать ${word.hanzi} из избранного` : `В избранное: ${word.hanzi}`}
                  onClick={() => store.toggleFavorite(word.id)}
                >
                  <StarIcon />
                </button>
                <DrawButton hanzi={word.hanzi} pinyin={word.pinyin} ru={word.ru} />
                <button type="button" className="hear" aria-label={`Слушать ${word.hanzi}`} onClick={() => hear(word.hanzi)}>
                  <Speaker />
                </button>
                {word.id.startsWith('c:') && (
                  <button type="button" className="text-btn" onClick={() => store.removeWord(word.id)}>
                    Убрать
                  </button>
                )}
              </span>
              {openWord === word.id && (
                <div className="word-more">
                  <Phrase text={word.hanzi} onSpeak={hear} chips />
                  {noteBody(word.note) && <p className="note">{noteBody(word.note)}</p>}
                  {word.example && (
                    <div className="example">
                      <div className="example-head">
                        <small>пример · нажми на слово</small>
                        <button type="button" className="hear" aria-label="Слушать пример" onClick={() => hear(word.example!.hanzi)}>
                          <Speaker />
                        </button>
                      </div>
                      <Phrase text={word.example.hanzi} onSpeak={hear} pinyin={word.example.pinyin} />
                      <span>{word.example.ru}</span>
                    </div>
                  )}
                  <AiPanel word={word} onSpeak={hear} />
                  <Strokes hanzi={word.hanzi} pinyin={word.pinyin} ru={word.ru} />
                </div>
              )}
            </li>
          ))}
        </ul>
        {words.length > shown && (
          <button type="button" className="text-btn" onClick={() => setShown((count) => count + 80)}>
            Ещё {Math.min(80, words.length - shown)} · всего {words.length}
          </button>
        )}
        {custom && list && (
          <button type="button" className="text-btn danger" onClick={() => { store.removeList(list.id); setOpenId('hsk1') }}>
            Удалить список
          </button>
        )}
      </div>

      {!fav && list && list.id !== 'tones' && (
        <div className="block" data-art="ink">
          <h2>Добавить слово</h2>
          <p>Иероглиф или пиньинь. Перевод, чтение и пример подберу сам.</p>
          <form className="inline-form" onSubmit={(event) => void addEntry(event)}>
            <input
              value={entry}
              onChange={(event) => setEntry(event.target.value)}
              placeholder="爱 или ai4"
              maxLength={40}
            />
            <button type="submit" className="primary" disabled={!entry.trim() || !!busy}>
              {busy === 'lookup' ? 'Смотрю…' : 'В список'}
            </button>
          </form>
          <label className={`ghost file${busy ? ' off' : ''}`}>
            {busy === 'scan' ? 'Смотрю фото…' : 'Сфотографировать'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={!!busy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                void scanPhoto(file)
              }}
            />
          </label>
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

async function shrinkPhoto(file: File) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Фото не открылось.')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.72)
}

function pageOf(note?: string) {
  return note?.match(/Стр\.\s*(\d+)/)?.[1] ?? ''
}

function noteBody(note?: string) {
  return note?.replace(/Стр\.\s*\d+\.?\s*/g, '').trim() ?? ''
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.2l2.4 5.1 5.6.7-4.1 3.8 1.1 5.5L12 15.8 7 18.3l1.1-5.5L4 9l5.6-.7L12 3.2z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Speaker() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10v4h3l4 3V7L7 10H4z" fill="currentColor" />
      <path d="M16 9.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M18.2 7.2a6.5 6.5 0 0 1 0 9.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
