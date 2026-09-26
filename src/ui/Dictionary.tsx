import { useEffect, useState } from 'react'
import { speak, unlockAudio } from '../lib/audio'
import { cardMeaning, dictLines, loadEntries, pieces, searchDict, splitExample, type DictEntry, type DictHit } from '../lib/dict'
import { useStore } from '../store'
import { Speaker } from './Lists'
import { Pinyin } from './Pinyin'
import { Strokes } from './Strokes'

const LIST_NAME = 'Из словаря'
const TRIES = ['shangke', 'hao3', 'учитель', 'пить чай', '上']

export function Dictionary() {
  const store = useStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DictHit[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    const q = query.trim()
    setError('')
    if (!q) {
      setResults([])
      setBusy(false)
      return
    }
    const control = new AbortController()
    setBusy(true)
    const timer = setTimeout(() => {
      searchDict(q, control.signal)
        .then((rows) => {
          setResults(rows)
          setOpen((current) => (rows.some((row) => `${row.hanzi}|${row.pinyin}` === current) ? current : null))
        })
        .catch((reason) => {
          if (!control.signal.aborted) setError(reason instanceof Error ? reason.message : 'Словарь не ответил.')
        })
        .finally(() => {
          if (!control.signal.aborted) setBusy(false)
        })
    }, 180)
    return () => {
      clearTimeout(timer)
      control.abort()
    }
  }, [query])

  function hear(text: string) {
    unlockAudio()
    void speak(text, store.settings.voice, store.settings.speed, 'vocab')
  }

  return (
    <section className="screen">
      <p className="eyebrow">словарь</p>
      <h1>Большой китайско-русский.</h1>
      <div className="dict-search">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Пиньинь, иероглиф или слово по-русски"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        {busy && <span className="dict-spin" aria-hidden="true" />}
      </div>

      {!query.trim() && (
        <div className="block dict-intro" data-art="scrolls">
          <p>
            Начало пиньиня без тонов или с цифрами, иероглифы или русское слово — ищу сразу, пока печатаешь.
          </p>
          <div className="dict-tries">
            {TRIES.map((item) => (
              <button key={item} type="button" className="chip" onClick={() => setQuery(item)}>
                {item}
              </button>
            ))}
          </div>
          <p className="fine">
            Статьи — 大БКРС, Большой китайско-русский словарь (bkrs.info), около 180 тысяч ходовых слов. Порядок — по частоте в
            живом языке.
          </p>
        </div>
      )}

      {error && <p className="warn">{error}</p>}
      {query.trim() && !busy && !error && !results.length && <p className="fine center">Ничего не нашлось. Попробуй короче или другим способом.</p>}

      {results.length > 0 && (
        <ul className="dict-list">
          {results.map((hit) => {
            const key = `${hit.hanzi}|${hit.pinyin}`
            const isOpen = open === key
            return (
              <li key={key} className={isOpen ? 'open' : undefined}>
                <button type="button" className="dict-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)}>
                  <b className="hanzi">{hit.hanzi}</b>
                  <span>
                    <Pinyin text={hit.pinyin} />
                    <small>{hit.short}</small>
                  </span>
                </button>
                {isOpen && <Article hit={hit} onSpeak={hear} onSearch={setQuery} />}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Article({ hit, onSpeak, onSearch }: { hit: DictHit; onSpeak: (text: string) => void; onSearch: (text: string) => void }) {
  const store = useStore()
  const [entries, setEntries] = useState<DictEntry[] | null>(null)
  const [error, setError] = useState('')
  const [all, setAll] = useState(false)

  useEffect(() => {
    let alive = true
    loadEntries(hit.hanzi)
      .then((rows) => alive && setEntries(rows.filter((row) => row.pinyin === hit.pinyin).concat(rows.filter((row) => row.pinyin !== hit.pinyin))))
      .catch((reason) => alive && setError(reason instanceof Error ? reason.message : 'Статья не загрузилась.'))
    return () => {
      alive = false
    }
  }, [hit.hanzi, hit.pinyin])

  const saved = store.words.find((word) => word.hanzi === hit.hanzi)
  const savedList = saved && store.lists.find((list) => list.id === saved.listId)

  function save() {
    const listId = store.lists.find((list) => !list.builtin && list.name === LIST_NAME)?.id ?? store.addList(LIST_NAME)
    store.addWord({
      id: `c:${crypto.randomUUID()}`,
      listId,
      hanzi: hit.hanzi,
      pinyin: hit.pinyin.split(', ')[0],
      ru: cardMeaning(hit.short),
      kind: 'vocab',
    })
  }

  const lines = (entries ?? []).map((entry) => dictLines(entry.body))
  const hidden = lines.reduce((sum, rows) => sum + hiddenExamples(rows).size, 0)

  return (
    <div className="dict-article">
      <div className="dict-head">
        <button type="button" className="hear" aria-label={`Слушать ${hit.hanzi}`} onClick={() => onSpeak(hit.hanzi)}>
          <Speaker />
        </button>
        {saved ? (
          <span className="fine">Уже в «{savedList?.name ?? 'списке'}»</span>
        ) : (
          <button type="button" className="primary" onClick={save}>
            В мои слова
          </button>
        )}
      </div>
      {error && <p className="warn">{error}</p>}
      {!entries && !error && <p className="fine">Открываю статью…</p>}
      {entries?.map((entry, index) => {
        const skip = all ? new Set<number>() : hiddenExamples(lines[index])
        return (
          <div key={`${entry.pinyin}-${index}`} className="dict-entry">
            {entries.length > 1 && <Pinyin text={entry.pinyin} className="dict-reading" />}
            {lines[index].map((line, row) =>
              skip.has(row) ? null : line.example ? (
                <Example key={row} text={line.text} level={line.level} onSpeak={onSpeak} />
              ) : (
                <p key={row} className={`dict-line l${Math.min(line.level, 4)}`}>
                  <Rich text={line.text} onSearch={onSearch} />
                </p>
              ),
            )}
          </div>
        )
      })}
      {hidden > 0 && (
        <button type="button" className="text-btn" onClick={() => setAll(!all)}>
          {all ? 'Свернуть примеры' : `Все примеры · ещё ${hidden}`}
        </button>
      )}
      <Strokes hanzi={hit.hanzi} />
    </div>
  )
}

function hiddenExamples(lines: { example: boolean }[]) {
  const hidden = new Set<number>()
  let run = 0
  lines.forEach((line, index) => {
    if (!line.example) {
      run = 0
      return
    }
    run += 1
    if (run > 2) hidden.add(index)
  })
  return hidden
}

function Example({ text, level, onSpeak }: { text: string; level: number; onSpeak: (text: string) => void }) {
  const { zh, ru } = splitExample(text)
  return (
    <p className={`dict-line dict-ex l${Math.min(level, 4)}`}>
      {zh && (
        <button type="button" className="hanzi" onClick={() => onSpeak(zh)}>
          {zh}
        </button>
      )}
      <span>{ru}</span>
    </p>
  )
}

function Rich({ text, onSearch }: { text: string; onSearch: (text: string) => void }) {
  return (
    <>
      {pieces(text).map((piece, index) => {
        if (piece.ref) {
          return (
            <button key={index} type="button" className="dict-ref" onClick={() => onSearch(piece.text)}>
              {piece.text}
            </button>
          )
        }
        if (piece.label) return <small key={index} className="dict-label">{piece.text}</small>
        if (piece.italic) return <em key={index}>{piece.text}</em>
        if (piece.bold) return <b key={index}>{piece.text}</b>
        return <span key={index}>{piece.text}</span>
      })}
    </>
  )
}
