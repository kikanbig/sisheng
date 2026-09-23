import type { Speed } from '../types'

export const SPEEDS: { id: Speed; label: string }[] = [
  { id: 'slow', label: 'Медленно' },
  { id: 'steady', label: 'Спокойно' },
  { id: 'clear', label: 'Ясно' },
  { id: 'brisk', label: 'Быстрее' },
]

export function SpeedPicker({ value, onChange }: { value: Speed; onChange: (speed: Speed) => void }) {
  return (
    <div className="speed-row" role="group" aria-label="Скорость речи">
      {SPEEDS.map((item) => (
        <button key={item.id} type="button" className={value === item.id ? 'speed on' : 'speed'} onClick={() => onChange(item.id)}>
          {item.label}
        </button>
      ))}
    </div>
  )
}
