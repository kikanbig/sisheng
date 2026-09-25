import { SCENES } from 'virtual:scenes'

export function pickScene(previous: string | null) {
  if (SCENES.length === 0) return previous
  if (SCENES.length === 1) return SCENES[0]
  let next = SCENES[Math.floor(Math.random() * SCENES.length)]
  for (let guard = 0; guard < 6 && next === previous; guard += 1) {
    next = SCENES[Math.floor(Math.random() * SCENES.length)]
  }
  return next
}
