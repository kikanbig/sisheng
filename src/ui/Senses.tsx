import type { Sense } from '../lib/senses'
import { Pinyin } from './Pinyin'

const bare = (text: string) => text.toLowerCase().replace(/\s+/g, '')

export function SenseList({
  senses,
  pinyin,
  ru,
  onSpeak,
}: {
  senses: Sense[]
  pinyin: string
  ru: string
  onSpeak?: (text: string) => void
}) {
  if (!senses.length) return <p className="fine">Других ходовых значений нет — учи это одно.</p>
  return (
    <ol className="senses">
      <li className="main">
        <em>1</em>
        <div>
          <b>{ru}</b>
          <small>основное · его и учим</small>
        </div>
      </li>
      {senses.map((sense, index) => (
        <li key={index}>
          <em>{index + 2}</em>
          <div>
            <p>
              <Pinyin text={sense.pinyin} />
              {bare(sense.pinyin) !== bare(pinyin) && <span className="tag">другое чтение</span>}
              <b>{sense.ru}</b>
            </p>
            {sense.example && (
              <button type="button" className="sense-example" disabled={!onSpeak} onClick={() => onSpeak?.(sense.example!.hanzi)}>
                <span className="hanzi">{sense.example.hanzi}</span>
                <small>{sense.example.ru}</small>
              </button>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
