declare module 'hanzi-writer' {
  type Writer = {
    animateCharacter: () => Promise<void>
    showOutline: (options?: { duration?: number }) => Promise<void>
    quiz: (options?: Record<string, unknown>) => void
    cancelQuiz: () => void
  }
  const HanziWriter: {
    create: (element: HTMLElement, character: string, options?: Record<string, unknown>) => Writer
  }
  export default HanziWriter
}
