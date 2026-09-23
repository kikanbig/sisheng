import { useState } from 'react'
import { Pinyin } from './Pinyin'
import type { Word } from '../types'

type Payload = Record<string, unknown>

export function AiPanel({ word }: { word: Word }) {
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')
  const [kind, setKind] = useState('')
  const [data, setData] = useState<Payload | null>(null)

  async function ask(next: 'explain' | 'mnemonic' | 'example') {
    setLoading(next)
    setError('')
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: next, hanzi: word.hanzi, pinyin: word.pinyin, ru: word.ru }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Ошибка')
      setKind(next)
      setData(payload)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вышло')
    } finally {
      setLoading('')
    }
  }

  const similar = Array.isArray(data?.similar) ? (data?.similar as { hanzi?: string; pinyin?: string; ru?: string }[]) : []
  const example = (data?.example && typeof data.example === 'object' ? data.example : data) as {
    hanzi?: string
    pinyin?: string
    ru?: string
  }

  return (
    <section className="ai">
      <div className="ai-actions">
        <button type="button" onClick={() => ask('explain')} disabled={!!loading}>
          {loading === 'explain' ? 'Думаю…' : 'Объяснить'}
        </button>
        <button type="button" onClick={() => ask('mnemonic')} disabled={!!loading}>
          {loading === 'mnemonic' ? 'Думаю…' : 'Мнемоника'}
        </button>
        <button type="button" onClick={() => ask('example')} disabled={!!loading}>
          {loading === 'example' ? 'Думаю…' : 'Ещё пример'}
        </button>
      </div>
      {error && <p className="warn">{error}</p>}
      {data && kind === 'explain' && (
        <div className="ai-body">
          {typeof data.hook === 'string' && <p className="hook">{data.hook}</p>}
          {typeof data.usage === 'string' && <p>{data.usage}</p>}
          {typeof data.trap === 'string' && data.trap && <p className="trap">{data.trap}</p>}
          {similar.length > 0 && (
            <ul className="similar">
              {similar.map((item, index) => (
                <li key={index}>
                  <b className="hanzi">{item.hanzi}</b> <Pinyin text={item.pinyin || ''} /> — {item.ru}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {data && kind === 'mnemonic' && typeof data.story === 'string' && <p className="ai-body">{data.story}</p>}
      {data && kind === 'example' && example.hanzi && (
        <div className="ai-body example">
          <p className="hanzi">{example.hanzi}</p>
          <Pinyin text={example.pinyin || ''} />
          <p>{example.ru}</p>
        </div>
      )}
      {data && <p className="fine">Модель иногда путает тон. Сверь пиньинь с карточкой.</p>}
    </section>
  )
}
