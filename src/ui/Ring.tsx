import { useId } from 'react'

export function Ring({ value, label, caption, className }: { value: number; label: string; caption: string; className?: string }) {
  const gradient = useId()
  const r = 52
  const length = 2 * Math.PI * r
  const filled = Math.min(1, Math.max(0, value))
  return (
    <div className={className ? `ring ${className}` : 'ring'}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--ring-a)" />
            <stop offset="55%" stopColor="var(--ring-b)" />
            <stop offset="100%" stopColor="var(--ring-c)" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} className="ring-track" />
        <circle
          cx="60"
          cy="60"
          r={r}
          className="ring-fill"
          stroke={`url(#${gradient})`}
          strokeDasharray={length}
          strokeDashoffset={length * (1 - filled)}
        />
      </svg>
      <div>
        <b>{label}</b>
        <small>{caption}</small>
      </div>
    </div>
  )
}
