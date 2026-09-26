import { useEffect, useState } from 'react'
import { alignGloss, cachedGloss, loadGloss, type GlossPart, type GlossWord } from '../lib/gloss'
import { syllables } from '../lib/pinyin'
import { loadSenses, type Sense } from '../lib/senses'
import { Pinyin } from './Pinyin'
import { SenseList } from './Senses'

type Explain = { hook?: string; usage?: string; trap?: string }

const hanCount = (text: string) => [...text].filter((char) => /\p{Script=Han}/u.test(char)).length

function readings(parts: GlossPart[], pinyin: string) {
  const pool = syllables(pinyin)
    .map((syllable) => syllable.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean)
  const total = parts.reduce((sum, part) => sum + hanCount(part.text), 0)
  let at = 0
  return parts.map((part) => {
    const need = hanCount(part.text)
    const own = pool.length === total ? pool.slice(at, at + need).join(' ') : part.word?.pinyin || ''
    at += need
    return own
  })
}

export function Phrase({
  text,
  onSpeak,
  chips = false,
  pinyin,
}: {
  text: string
  onSpeak: (text: string) => void
  chips?: boolean
  pinyin?: string
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

  const parts: GlossPart[] = words ? alignGloss(text, words) : [{ text }]
  const tokens = parts.filter((part) => part.word)
  if (chips && tokens.length < 2) {
    const chars = tokens.length === 1 ? tokens[0].word!.chars : []
    if (chars.length < 2) return null
    return (
      <div className="phrase chips">
        <div className="gloss-chars">
          {chars.map((part, index) => (
            <button key={index} type="button" onClick={() => onSpeak(part.hanzi)}>
              <b className="hanzi">{part.hanzi}</b>
              <Pinyin text={part.pinyin} />
              <small>{part.ru}</small>
            </button>
          ))}
        </div>
      </div>
    )
  }
  const ruby = !chips && pinyin !== undefined && tokens.length > 0
  const said = ruby ? readings(parts, pinyin) : []
  const current = open !== null ? parts[open]?.word : undefined

  return (
    <div className={chips ? 'phrase chips' : 'phrase'}>
      <p className={ruby ? 'hanzi phrase-line ruby' : 'hanzi phrase-line'}>
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
              {ruby ? <span className="token-han">{part.text}</span> : part.text}
              {ruby && <Pinyin text={said[index]} />}
              {chips && <small>{part.word.pinyin}</small>}
            </button>
          ) : (
            <span key={index} className={ruby ? 'token-gap' : undefined}>
              {part.text}
            </span>
          ),
        )}
      </p>
      {!ruby && pinyin !== undefined && <Pinyin text={pinyin} />}
      {!words && !failed && !chips && <p className="fine">Разбираю по словам…</p>}
      {current && <GlossCard key={`${text}|${open}`} word={current} onSpeak={onSpeak} />}
    </div>
  )
}

function GlossCard({ word, onSpeak }: { word: GlossWord; onSpeak: (text: string) => void }) {
  const [more, setMore] = useState<Explain | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [senses, setSenses] = useState<Sense[] | null>(null)
  const [showSenses, setShowSenses] = useState(false)
  const [sensesBusy, setSensesBusy] = useState(false)

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

  async function toggleSenses() {
    if (senses) {
      setShowSenses(!showSenses)
      return
    }
    setSensesBusy(true)
    setError('')
    try {
      setSenses(await loadSenses(word.hanzi, word.pinyin, word.ru))
      setShowSenses(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вышло')
    } finally {
      setSensesBusy(false)
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
      {word.chars.length > 1 && (
        <div className="gloss-chars">
          {word.chars.map((part, index) => (
            <button key={index} type="button" onClick={() => onSpeak(part.hanzi)}>
              <b className="hanzi">{part.hanzi}</b>
              <Pinyin text={part.pinyin} />
              <small>{part.ru}</small>
            </button>
          ))}
        </div>
      )}
      <div className="gloss-actions">
        <button type="button" onClick={() => onSpeak(word.hanzi)}>
          Слушать
        </button>
        {!more && (
          <button type="button" onClick={() => void explain()} disabled={busy}>
            {busy ? 'Думаю…' : 'Подробнее'}
          </button>
        )}
        <button type="button" className={senses && showSenses ? 'on' : undefined} onClick={() => void toggleSenses()} disabled={sensesBusy}>
          {sensesBusy ? 'Ищу…' : 'Другие значения'}
        </button>
      </div>
      {error && <p className="warn">{error}</p>}
      {senses && showSenses && <SenseList senses={senses} pinyin={word.pinyin} ru={word.ru} onSpeak={onSpeak} />}
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
