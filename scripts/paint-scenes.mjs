import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'art', 'scenes')
mkdirSync(root, { recursive: true })

const COUNT = 200

function rngOf(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function ridge(rng, base, height) {
  const steps = 5
  let d = `M0 ${base.toFixed(1)}`
  for (let i = 0; i < steps; i += 1) {
    const x1 = (800 / steps) * i
    const x2 = (800 / steps) * (i + 1)
    const peak = base - height * (0.62 + rng() * 0.5)
    const end = base - height * rng() * 0.28
    d += ` Q ${((x1 + x2) / 2).toFixed(1)} ${peak.toFixed(1)} ${x2.toFixed(1)} ${end.toFixed(1)}`
  }
  return `${d} L800 1100 L0 1100 Z`
}

function branch(rng, side) {
  const x0 = side < 0 ? -20 : 620
  const petals = []
  for (let i = 0; i < 14; i += 1) {
    const x = x0 + rng() * 220
    const y = 40 + rng() * 280
    const r = 7 + rng() * 8
    petals.push(
      `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${r.toFixed(1)}" ry="${(r * 0.7).toFixed(1)}" fill="#e7b4b0" opacity="${(0.45 + rng() * 0.4).toFixed(2)}" transform="rotate(${(rng() * 80).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`,
    )
  }
  const stem = `<path d="M${side < 0 ? 40 : 760} -10 C ${side < 0 ? 180 : 620} 80, ${side < 0 ? 80 : 700} 180, ${side < 0 ? 240 : 540} 260" fill="none" stroke="#6d7c70" stroke-width="3" opacity="0.55"/>`
  return stem + petals.join('')
}

function bamboo(rng) {
  const x = 40 + rng() * 80
  const stalks = [0, 18, 34].map((shift, index) => {
    const sx = x + shift
    return `<path d="M${sx} 1100 L${sx} ${200 + index * 40}" stroke="#7d917f" stroke-width="${index === 1 ? 7 : 4}" opacity="0.45"/>
      <path d="M${sx} ${320 + index * 30} q ${index % 2 ? 40 : -36} -20 ${index % 2 ? 70 : -60} -8" fill="none" stroke="#8aa48a" stroke-width="2" opacity="0.5"/>`
  })
  return stalks.join('')
}

function moon(rng) {
  const cx = 520 + rng() * 180
  const cy = 90 + rng() * 70
  return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="36" fill="#f7f1e4" opacity="0.9"/>
    <circle cx="${(cx + 10).toFixed(0)}" cy="${cy.toFixed(0)}" r="30" fill="#f3efe4" opacity="0.35"/>`
}

function pavilion(rng) {
  const x = 280 + rng() * 220
  const y = 430 + rng() * 80
  return `<path d="M${x} ${y + 70} l70 -28 l70 28 v8 h-140 z" fill="#5e6f64" opacity="0.55"/>
    <path d="M${x + 18} ${y + 78} v46 h104 v-46" fill="#6d7f73" opacity="0.4"/>
    <path d="M${x + 62} ${y + 78} v46" stroke="#4e5e54" stroke-width="3" opacity="0.35"/>`
}

function bird(rng) {
  const x = 180 + rng() * 400
  const y = 160 + rng() * 80
  return `<path d="M${x} ${y} q 18 -16 36 0 q 16 -18 34 2" fill="none" stroke="#5c6b62" stroke-width="2.4" stroke-linecap="round" opacity="0.7"/>`
}

function bowl(rng) {
  const x = 340 + rng() * 120
  const y = 640 + rng() * 40
  return `<ellipse cx="${x}" cy="${y}" rx="54" ry="16" fill="#c4b49a" opacity="0.45"/>
    <path d="M${x - 48} ${y} q 48 46 96 0" fill="#d9cbb4" opacity="0.7"/>
    <path d="M${x} ${y - 8} q 6 -28 2 -48" fill="none" stroke="#efe8dc" stroke-width="3" opacity="0.7"/>`
}

function book(rng) {
  const x = 300 + rng() * 80
  const y = 560 + rng() * 40
  return `<path d="M${x} ${y} h90 v64 h-90 z" fill="#f4efe6" opacity="0.75"/>
    <path d="M${x + 90} ${y} h78 v64 h-78 z" fill="#e7efe6" opacity="0.8"/>
    <path d="M${x + 90} ${y} v64" stroke="#8d9a90" stroke-width="2"/>`
}

function pine(rng) {
  const x = 620 + rng() * 80
  return `<path d="M${x} 1100 L${x + 6} 520" stroke="#5d6e63" stroke-width="5" opacity="0.45"/>
    <path d="M${x + 6} 620 l-48 -8 l40 -36 l-36 -6 l34 -40 l-8 44 l42 -4 z" fill="#6e8574" opacity="0.45"/>
    <path d="M${x + 6} 760 l-36 6 l28 -28 z" fill="#7d947f" opacity="0.4"/>`
}

const motifs = [branch, bamboo, moon, pavilion, bird, bowl, book, pine]

function scene(index) {
  const rng = rngOf(index * 9973 + 17)
  const skyTop = ['#f6f1e6', '#f3efe4', '#eef3ee', '#f7f2ea'][index % 4]
  const skyBot = ['#d5e0d8', '#e4ebe4', '#d7e3ea', '#e7ddd0'][index % 4]
  const layers = [
    ['#d5e3d8', 220, 140],
    ['#b7cbb8', 380, 180],
    ['#8eaa93', 560, 200],
    ['#6d8b74', 760, 160],
  ]
  const hills = layers
    .map(([color, base, height], layer) => {
      const lift = (rng() - 0.5) * 40
      return `<path d="${ridge(rng, base + lift, height)}" fill="${color}" opacity="${(0.55 + layer * 0.1).toFixed(2)}"/>`
    })
    .join('')
  const mist = Array.from({ length: 3 }, () => {
    const cx = rng() * 800
    const cy = 520 + rng() * 280
    return `<ellipse cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" rx="${(120 + rng() * 180).toFixed(0)}" ry="${(28 + rng() * 30).toFixed(0)}" fill="#f7f3ea" opacity="${(0.28 + rng() * 0.25).toFixed(2)}"/>`
  }).join('')
  const motif = motifs[index % motifs.length](rng, index % 2 === 0 ? -1 : 1)
  const extra = index % 5 === 0 ? bird(rng) : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${skyTop}"/>
      <stop offset="1" stop-color="${skyBot}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="1000" fill="url(#g)"/>
  ${hills}
  ${mist}
  ${motif}
  ${extra}
</svg>`
}

for (let i = 0; i < COUNT; i += 1) writeFileSync(join(root, `${i}.svg`), scene(i))

const wash = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7f3ea"/>
      <stop offset="1" stop-color="#e4ebe6"/>
    </linearGradient>
  </defs>
  <rect width="800" height="1000" fill="url(#g)"/>
  <path d="M0 620 Q200 540 400 600 T800 560 L800 1000 L0 1000 Z" fill="#d5e0d8" opacity="0.8"/>
  <path d="M0 760 Q240 680 480 740 T800 700 L800 1000 L0 1000 Z" fill="#b7c7bc" opacity="0.55"/>
  <ellipse cx="140" cy="80" rx="90" ry="28" fill="#f3d5d0" opacity="0.35"/>
</svg>`
writeFileSync(join(dirname(root), 'wash.svg'), wash)
console.log(`painted ${COUNT}`)
