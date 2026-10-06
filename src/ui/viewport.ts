// The app's frame on a phone. Installed on the Home Screen (standalone, black-translucent status bar,
// viewport-fit=cover) recent iOS versions lay the page out shorter than the screen by about the top safe-area inset:
// every CSS height (100%, vh, dvh, lvh) reports the short value, so the bottom bar stops above an empty strip, and the
// reported top inset can come back too small, letting the header run up under the status bar. The page itself does
// cover the whole screen, so the frame is sized from the screen here, and the missing height doubles as a floor for the
// top inset. In a browser tab nothing changes: the toolbars own the edges there and 100% is right.
// Everything is written to CSS variables on <html>: --app-h (the frame's height) and --sat-min (a floor for the top
// safe area); global.css does the rest.

const standalone = () =>
  (typeof matchMedia !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches)) ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

/** The top safe-area inset the browser reports (0 where there is none or it is not reported). */
function reportedTop(): number {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px)'
  document.body.appendChild(probe)
  const v = parseFloat(getComputedStyle(probe).paddingTop) || 0
  probe.remove()
  return v
}

function measure() {
  const root = document.documentElement
  if (!standalone()) {
    root.style.removeProperty('--app-h')
    root.style.removeProperty('--sat-min')
    return
  }
  const inner = Math.max(window.innerHeight, root.clientHeight, window.visualViewport?.height || 0)
  const portrait = window.innerHeight >= window.innerWidth
  // iOS reports the screen in portrait whatever the orientation
  const screenH = portrait ? Math.max(screen.height, screen.width) : Math.min(screen.height, screen.width)
  const gap = screenH - inner
  // only the iOS shortfall (a status bar's worth) is corrected: anything bigger means a keyboard, split view or an
  // unusual window, where the measured height is the right one
  const short = gap > 8 && gap <= 120
  root.style.setProperty('--app-h', `${short ? screenH : inner}px`)
  // the missing height is the top inset iOS took off; never let the header sit higher than that
  const top = reportedTop()
  if (short && portrait && gap > top + 2) root.style.setProperty('--sat-min', `${gap}px`)
  else root.style.removeProperty('--sat-min')
}

/** Start keeping the frame in step with the screen (once, at app start). */
export function initViewport() {
  measure()
  const again = () => requestAnimationFrame(measure)
  window.addEventListener('resize', again)
  window.addEventListener('orientationchange', () => { again(); window.setTimeout(measure, 350) })
  window.addEventListener('pageshow', again)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) again() })
  window.visualViewport?.addEventListener('resize', again)
  // iOS settles the size of an installed app a moment after launch
  for (const ms of [300, 1000, 2500]) window.setTimeout(measure, ms)
}
