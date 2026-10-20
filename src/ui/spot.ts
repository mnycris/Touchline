// The search field lives in the always-mounted Spotlight layer. Opening it focuses the field inside the tap itself:
// iOS only raises the keyboard for a focus that happens in the user's gesture, not one that waits for a render.
import { useGame } from '../store/game'

export const spotInput: { el: HTMLInputElement | null } = { el: null }

export function openSpotlight() {
  const el = spotInput.el
  if (el) { el.focus({ preventScroll: true }); el.select() }
  useGame.getState().openSearch()
}
