import { useMemo, useState } from 'react'
import { lessonDrills, type HanziChoice, type PhraseBuild, type PinyinPick, type ToneWord } from '../data/drills'
import { speak, unlockAudio } from '../lib/audio'
import { useStore } from '../store'
import { Pinyin } from './Pinyin'

type Kind = 'tones' | 'picks' | 'choices' | 'builds'

const TONE_MARK = ['·', 'ˉ', 'ˊ', 'ˇ', 'ˋ']

export function DrillLaunchers({
  lessonId,
  progress,
  onStart,
}: {
  lessonId: string
  progress: Record<string, number>
  onStart: (kind: Kind) => void
}) {
  const pack = lessonDrills[lessonId]
  if (!pack) return null
  const toneItems = pack.tones.length ? pack.tones : pack.picks
  const toneKind: Kind = pack.tones.length ? 'tones' : 'picks'
  const toneLabel = pack.tones.length ? 'Тоны' : 'Пиньинь'
  return (
    <div className="drill-launch">
      <Launch label={toneLabel} done={countDone(toneItems, progress)} all={toneItems.length} onClick={() => onStart(toneKind)} />
      <Launch label="Иероглиф" done={countDone(pack.choices, progress)} all={pack.choices.length} onClick={() => onStart('choices')} />
      <Launch label="Фраза" done={countDone(pack.builds, progress)} all={pack.builds.length} onClick={() => onStart('builds')} />
    </div>
  )
}

function Launch({ label, done, all, onClick }: { label: string; done: number; all: number; onClick: () => void }) {
  return (
    <button type="button" className="ghost drill-launch-btn" onClick={onClick}>
      <b>{done >= all && all > 0 ? 'Ещё раз' : label}</b>
      <small>
        {done}/{all}
      </small>
    </button>
  )
}

export function DrillSession({ lessonId, kind, onClose }: { lessonId: string; kind: Kind; onClose: () => void }) {
  const store = useStore()
  const pack = lessonDrills[lessonId]
  const items = kind === 'tones' ? pack.tones : kind === 'picks' ? pack.picks : kind === 'choices' ? pack.choices : pack.builds
  const first = Math.max(0, items.findIndex((item) => (store.workbook[item.id] ?? 0) < 1))
  const [index, setIndex] = useState(first < 0 ? 0 : first)
  const [round, setRound] = useState(0)
  const [finished, setFinished] = useState(false)
  const item = items[index]
  const title = kind === 'tones' ? 'Тоны' : kind === 'picks' ? 'Пиньинь' : kind === 'choices' ? 'Иероглиф' : 'Фраза'

  function advance(id: string) {
    store.markWorkbook(id, 1)
    if (index + 1 < items.length) {
      setIndex(index + 1)
      setRound((value) => value + 1)
      return
    }
    setFinished(true)
  }

  if (!item) return null
  return (
    <div className="practice" role="dialog" aria-modal="true" aria-label={title}>
      <div className="practice-sheet">
        <header className="practice-top">
          <button type="button" className="practice-close" onClick={onClose}>
            Назад
          </button>
          <span className="eyebrow">
            {title} · {finished ? items.length : index + 1}/{items.length}
          </span>
        </header>
        {finished ? (
          <button type="button" className="primary" onClick={onClose}>
            К уроку
          </button>
        ) : null}
        {!finished && kind === 'tones' && <ToneCard key={item.id + round} item={item as ToneWord} onDone={() => advance(item.id)} />}
        {!finished && kind === 'picks' && <PickCard key={item.id} item={item as PinyinPick} onDone={() => advance(item.id)} />}
        {!finished && kind === 'choices' && <ChoiceCard key={item.id} item={item as HanziChoice} onDone={() => advance(item.id)} />}
        {!finished && kind === 'builds' && <BuildCard key={item.id + round} item={item as PhraseBuild} onDone={() => advance(item.id)} />}
      </div>
    </div>
  )
}

function ToneCard({ item, onDone }: { item: ToneWord; onDone: () => void }) {
  const store = useStore()
  const [picked, setPicked] = useState<(number | null)[]>(() => item.tones.map(() => null))
  const [at, setAt] = useState(0)
  const [miss, setMiss] = useState(false)

  function choose(tone: number) {
    const next = picked.slice()
    next[at] = tone
    setPicked(next)
    const last = at === item.bare.length - 1
    if (!last) {
      setAt(at + 1)
      return
    }
    const ok = next.every((value, index) => value === item.tones[index])
    if (ok) onDone()
    else setMiss(true)
  }

  function hear() {
    unlockAudio()
    void speak(item.hanzi, store.settings.voice, store.settings.speed, 'vocab')
  }

  return (
    <>
      <p className="hanzi drill-hanzi">{item.hanzi}</p>
      <div className="tone-slots">
        {item.bare.map((syllable, index) => (
          <button key={syllable + index} type="button" className={index === at ? 'tone-slot on' : 'tone-slot'} onClick={() => setAt(index)}>
            <b>{syllable}</b>
            <small>{picked[index] == null ? ' ' : TONE_MARK[picked[index] ?? 0]}</small>
          </button>
        ))}
      </div>
      <div className="tone-keys">
        {[1, 2, 3, 4, 0].map((tone) => (
          <button key={tone} type="button" className="ghost" onClick={() => choose(tone)}>
            {tone === 0 ? 'лёгкий' : `${tone} ${TONE_MARK[tone]}`}
          </button>
        ))}
      </div>
      <p className="fine practice-note">
        {miss ? (
          <>
            Было <Pinyin text={item.pinyin} />.{' '}
            <button type="button" className="text-btn" onClick={hear}>
              Слушать
            </button>
          </>
        ) : (
          <>Отметь тон слога. стр. {item.page}</>
        )}
      </p>
      {miss && (
        <button
          type="button"
          className="primary"
          onClick={() => {
            setPicked(item.tones.map(() => null))
            setAt(0)
            setMiss(false)
          }}
        >
          Ещё раз
        </button>
      )}
    </>
  )
}

function PickCard({ item, onDone }: { item: PinyinPick; onDone: () => void }) {
  const [wrong, setWrong] = useState<number | null>(null)
  return (
    <>
      <p className="hanzi drill-hanzi">{item.hanzi}</p>
      <p className="fine">Какой пиньинь верный? стр. {item.page}</p>
      <div className="drill-options">
        {item.options.map((option, index) => (
          <button
            key={option}
            type="button"
            className={wrong === index ? 'ghost wrong' : 'ghost'}
            onClick={() => {
              if (index === item.answer) onDone()
              else setWrong(index)
            }}
          >
            <Pinyin text={option} />
          </button>
        ))}
      </div>
      {wrong != null && <p className="fine practice-note">Не то. Попробуй другой.</p>}
    </>
  )
}

function ChoiceCard({ item, onDone }: { item: HanziChoice; onDone: () => void }) {
  const [wrong, setWrong] = useState<number | null>(null)
  return (
    <>
      <p className="hanzi drill-sentence">
        {item.before}
        <span className="drill-blank">{wrong != null && wrong !== item.answer ? item.options[wrong] : '　'}</span>
        {item.after}
      </p>
      <p className="fine">стр. {item.page}</p>
      <div className="drill-options">
        {item.options.map((option, index) => (
          <button
            key={option}
            type="button"
            className={wrong === index ? 'ghost wrong hanzi' : 'ghost hanzi'}
            onClick={() => {
              if (index === item.answer) onDone()
              else setWrong(index)
            }}
          >
            {option}
          </button>
        ))}
      </div>
      {wrong != null && <p className="fine practice-note">Не то. Попробуй другой.</p>}
    </>
  )
}

function BuildCard({ item, onDone }: { item: PhraseBuild; onDone: () => void }) {
  const bank0 = useMemo(() => mix(item.words), [item])
  const [bank, setBank] = useState(bank0)
  const [line, setLine] = useState<typeof bank0>([])
  const [miss, setMiss] = useState(false)
  const answer = item.words.join('')

  function take(chip: (typeof bank)[number]) {
    setMiss(false)
    setBank((current) => current.filter((item) => item.key !== chip.key))
    setLine((current) => [...current, chip])
  }

  function putBack(chip: (typeof bank)[number]) {
    setMiss(false)
    setLine((current) => current.filter((item) => item.key !== chip.key))
    setBank((current) => [...current, chip])
  }

  const built = line.map((chip) => chip.word).join('')

  return (
    <>
      <Pinyin text={item.pinyin} />
      <p className="fine">Собери фразу. стр. {item.page}</p>
      <div className="build-line">
        {line.length === 0 && <span className="fine">Сюда</span>}
        {line.map((chip) => (
          <button key={chip.key} type="button" className="ghost hanzi" onClick={() => putBack(chip)}>
            {chip.word}
          </button>
        ))}
      </div>
      <div className="build-bank">
        {bank.map((chip) => (
          <button key={chip.key} type="button" className="ghost hanzi" onClick={() => take(chip)}>
            {chip.word}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="primary"
        disabled={!line.length}
        onClick={() => {
          if (built === answer) onDone()
          else setMiss(true)
        }}
      >
        Проверить
      </button>
      {miss && (
        <p className="fine practice-note">
          В книге: <b className="hanzi">{item.words.join('')}</b>
        </p>
      )}
    </>
  )
}

function mix(words: string[]) {
  const chips = words.map((word, key) => ({ word, key }))
  for (let i = chips.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[chips[i], chips[j]] = [chips[j], chips[i]]
  }
  if (chips.length > 1 && chips.every((chip, index) => chip.key === index)) {
    ;[chips[0], chips[1]] = [chips[1], chips[0]]
  }
  return chips
}

function countDone(items: { id: string }[], progress: Record<string, number>) {
  return items.filter((item) => (progress[item.id] ?? 0) >= 1).length
}
