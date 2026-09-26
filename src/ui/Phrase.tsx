import { useEffect, useState } from 'react'
import { alignGloss, cachedGloss, loadGloss, type GlossWord } from '../lib/gloss'
import { Pinyin } from './Pinyin'

type Explain = { hook?: string; usage?: string; trap?: string }

export function Phrase({
  text,
  onSpeak,
  chips = false,
}: {
  text: string
  onSpeak: (text: string) => void
  chips?: boolean
}) {
  const [words, setWords] = useState<GlossWord[] | null>(() => cachedGloss(text))
  const [open, setOpen] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [seen, setSeen] = useState(text)
  if (seen !== text) {
    setSeen(text)
    setWords(cachedGloss(text))
    setOpen(null)
    setFailed(false)
  }

  useEffect(() => {
    if (cachedGloss(text)) return
    let live = true
    loadGloss(text)
      .then((next) => {
        if (live) setWords(next)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [text])

  const parts = words ? alignGloss(text, words) : [{ text }]
  const tokens = parts.filter((part) => part.word)
  if (chips && tokens.length < 2) return null
  const current = open !== null ? parts[open]?.word : undefined

  return (
    <div className={chips ? 'phrase chips' : 'phrase'}>
      <p className="hanzi phrase-line">
        {parts.map((part, index) =>
          part.word ? (
            <button
              key={index}
              type="button"
              className={open === index ? 'token on' : 'token'}
              onClick={() => {
                setOpen(open === index ? null : index)
                if (open !== index && part.word) onSpeak(part.word.hanzi)
              }}
            >
              {part.text}
              {chips && <small>{part.word.pinyin}</small>}
            </button>
          ) : (
            <span key={index}>{part.text}</span>
          ),
        )}
      </p>
      {!words && !failed && !chips && <p className="fine">Разбираю по словам…</p>}
      {current && <GlossCard key={`${text}|${open}`} word={current} onSpeak={onSpeak} />}
    </div>
  )
}

function GlossCard({ word, onSpeak }: { word: GlossWord; onSpeak: (text: string) => void }) {
  const [more, setMore] = useState<Explain | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function explain() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'explain', hanzi: word.hanzi, pinyin: word.pinyin, ru: word.ru }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ошибка')
      setMore(data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вышло')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="gloss">
      <div className="gloss-head">
        <b className="hanzi">{word.hanzi}</b>
        <Pinyin text={word.pinyin} />
        <span>{word.ru}</span>
      </div>
      {word.note && <p className="gloss-note">{word.note}</p>}
      <div className="gloss-actions">
        <button type="button" onClick={() => onSpeak(word.hanzi)}>
          Слушать
        </button>
        {!more && (
          <button type="button" onClick={() => void explain()} disabled={busy}>
            {busy ? 'Думаю…' : 'Подробнее'}
          </button>
        )}
      </div>
      {error && <p className="warn">{error}</p>}
      {more && (
        <div className="ai-body">
          {more.hook && <p className="hook">{more.hook}</p>}
          {more.usage && <p>{more.usage}</p>}
          {more.trap && <p className="trap">{more.trap}</p>}
        </div>
      )}
    </div>
  )
}
