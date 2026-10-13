/** После раскрытия карточки показывает её в видимой области списка, а не оставляет за краем. */
export function revealOpened(node: HTMLElement) {
  const scroller = node.closest('.word-list')
  const rect = node.getBoundingClientRect()
  if (scroller instanceof HTMLElement) {
    const box = scroller.getBoundingClientRect()
    if (rect.top >= box.top + 4 && rect.bottom <= box.bottom - 4) return
    const delta = rect.top - box.top
    const fits = rect.height + 20 < scroller.clientHeight
    const top = scroller.scrollTop + (fits ? delta - (scroller.clientHeight - rect.height) / 2 : delta - 8)
    scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    return
  }
  const fits = rect.height + 120 < window.innerHeight
  node.scrollIntoView({ block: fits ? 'center' : 'start', behavior: 'smooth', inline: 'nearest' })
}
