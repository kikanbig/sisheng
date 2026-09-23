import { useEffect, useRef } from 'react'

export function Strokes({ hanzi }: { hanzi: string }) {
  const chars = [...hanzi].filter((char) => /\p{Script=Han}/u.test(char)).slice(0, 4)
  const host = useRef<HTMLDivElement>(null)
  const writers = useRef<{ animateCharacter: () => Promise<void> }[]>([])

  useEffect(() => {
    let gone = false
    writers.current = []
    const nodes = host.current ? [...host.current.querySelectorAll<HTMLDivElement>('[data-char]')] : []
    nodes.forEach((node) => {
      node.innerHTML = ''
    })
    ;(async () => {
      const mod = await import('hanzi-writer')
      if (gone) return
      const HanziWriter = mod.default
      const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#1c1612'
      const line = getComputedStyle(document.documentElement).getPropertyValue('--line').trim() || '#e3d5c4'
      for (let i = 0; i < chars.length; i += 1) {
        const node = nodes[i]
        if (!node) continue
        try {
          const writer = HanziWriter.create(node, chars[i], {
            width: 96,
            height: 96,
            padding: 6,
            showOutline: true,
            strokeAnimationSpeed: 0.9,
            delayBetweenStrokes: 90,
            strokeColor: ink,
            outlineColor: line,
            radicalColor: '#c2452d',
          })
          writers.current.push(writer)
        } catch {
          node.textContent = chars[i]
        }
      }
    })()
    return () => {
      gone = true
    }
  }, [hanzi])

  if (!chars.length) return null

  return (
    <div className="strokes">
      <div className="stroke-row" ref={host}>
        {chars.map((char, index) => (
          <div key={`${hanzi}-${index}`} data-char={char} className="stroke-box" />
        ))}
      </div>
      <button
        type="button"
        className="text-btn"
        onClick={() => {
          for (const writer of writers.current) void writer.animateCharacter()
        }}
      >
        Порядок черт
      </button>
    </div>
  )
}
