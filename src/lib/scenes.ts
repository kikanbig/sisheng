export const SCENE_COUNT = 200

export function sceneFor(id: string) {
  let hash = 0
  for (const char of id) hash = (Math.imul(hash, 33) + char.charCodeAt(0)) >>> 0
  return `/art/scenes/${hash % SCENE_COUNT}.svg`
}
