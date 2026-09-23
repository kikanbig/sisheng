declare module 'hanzi-writer' {
  type Writer = {
    animateCharacter: () => Promise<void>
    animateStroke: (strokeNum: number) => Promise<unknown>
    showCharacter: (options?: { duration?: number }) => Promise<unknown>
    showOutline: (options?: { duration?: number }) => Promise<void>
    pauseAnimation: () => Promise<unknown>
    getCharacterData: () => Promise<{ strokes: { isInRadical: boolean }[] }>
    quiz: (options?: Record<string, unknown>) => void
    cancelQuiz: () => void
  }
  const HanziWriter: {
    create: (element: HTMLElement, character: string, options?: Record<string, unknown>) => Writer
  }
  export default HanziWriter
}
