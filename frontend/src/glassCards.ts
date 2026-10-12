const CARD_SELECTOR = '.glass-card'
const EASE_RATE = 9

interface CardState {
  hovered: boolean
  focused: boolean
  value: number
}

export interface ActiveGlassCard {
  rect: DOMRect
  clip: { left: number; top: number; right: number; bottom: number }
  value: number
}

const clipAncestors = new WeakMap<Element, Element[]>()

const getClipAncestors = (card: Element): Element[] => {
  let ancestors = clipAncestors.get(card)
  if (!ancestors) {
    ancestors = []
    for (let el = card.parentElement; el && el !== document.body; el = el.parentElement) {
      const { overflowX, overflowY } = getComputedStyle(el)
      if (overflowX !== 'visible' || overflowY !== 'visible') ancestors.push(el)
    }
    clipAncestors.set(card, ancestors)
  }
  return ancestors
}

// The canvas sits behind the page, so the lens must be clipped to scroll containers by hand.
const clipRectFor = (card: Element) => {
  const clip = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
  // Cards that scroll under the translucent header stay visible there, so their lens must too.
  if (card.hasAttribute('data-glass-unclipped')) return clip
  for (const ancestor of getClipAncestors(card)) {
    const r = ancestor.getBoundingClientRect()
    clip.left = Math.max(clip.left, r.left)
    clip.top = Math.max(clip.top, r.top)
    clip.right = Math.min(clip.right, r.right)
    clip.bottom = Math.min(clip.bottom, r.bottom)
  }
  return clip
}

const cards = new Map<Element, CardState>()

const cardFor = (target: EventTarget | null): Element | null =>
  target instanceof Element ? target.closest(CARD_SELECTOR) : null

const stateFor = (card: Element): CardState => {
  let state = cards.get(card)
  if (!state) {
    state = { hovered: false, focused: false, value: 0 }
    cards.set(card, state)
  }
  return state
}

const leftCard = (card: Element, related: EventTarget | null) => !(related instanceof Node && card.contains(related))

// Delegated listeners let cards opt in with a class alone, with no per-card registration in React.
export function trackGlassCards(): () => void {
  const onOver = (e: PointerEvent) => {
    const card = cardFor(e.target)
    if (card) stateFor(card).hovered = true
  }
  const onOut = (e: PointerEvent) => {
    const card = cardFor(e.target)
    if (card && leftCard(card, e.relatedTarget)) {
      const state = cards.get(card)
      if (state) state.hovered = false
    }
  }
  const onFocusIn = (e: FocusEvent) => {
    const card = cardFor(e.target)
    if (card && e.target instanceof Element && e.target.matches(':focus-visible')) stateFor(card).focused = true
  }
  const onFocusOut = (e: FocusEvent) => {
    const card = cardFor(e.target)
    if (card && leftCard(card, e.relatedTarget)) {
      const state = cards.get(card)
      if (state) state.focused = false
    }
  }

  document.addEventListener('pointerover', onOver)
  document.addEventListener('pointerout', onOut)
  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', onFocusOut)

  return () => {
    document.removeEventListener('pointerover', onOver)
    document.removeEventListener('pointerout', onOut)
    document.removeEventListener('focusin', onFocusIn)
    document.removeEventListener('focusout', onFocusOut)
    cards.clear()
  }
}

export function sampleGlassCards(dtSeconds: number, max: number): ActiveGlassCard[] {
  const active: ActiveGlassCard[] = []
  const blend = 1 - Math.exp(-dtSeconds * EASE_RATE)

  cards.forEach((state, card) => {
    const target = state.hovered || state.focused ? 1 : 0
    state.value += (target - state.value) * blend

    if (!card.isConnected || (target === 0 && state.value < 0.01)) {
      cards.delete(card)
      return
    }
    active.push({ rect: card.getBoundingClientRect(), clip: clipRectFor(card), value: state.value })
  })

  return active.sort((a, b) => b.value - a.value).slice(0, max)
}
