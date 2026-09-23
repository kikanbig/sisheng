declare module 'hanzi-writer' {
  type Writer = { animateCharacter: () => Promise<void> }
  const HanziWriter: {
    create: (element: HTMLElement, character: string, options?: Record<string, unknown>) => Writer
  }
  export default HanziWriter
}
