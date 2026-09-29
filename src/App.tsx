import { useEffect, type ComponentType } from 'react'
import { useGame } from './store/game'
import { applyTheme } from './ui/theme'
import { BottomNav } from './ui/components/layout'
import { Icon } from './ui/icons/Icon'
import { MainMenu } from './ui/screens/Menu'
import { ROUTES, TAB_ROOT } from './ui/routes'

export default function App() {
  const world = useGame((s) => s.world)
  const refreshSaves = useGame((s) => s.refreshSaves)
  const loadDb = useGame((s) => s.loadDb)
  const userClubId = world?.userClubId
  const clubTheme = world ? world.clubs[world.userClubId]?.theme : undefined

  useEffect(() => {
    refreshSaves()
    // warm the database in the background so New Career opens instantly
    const t = window.setTimeout(() => loadDb(), 400)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    applyTheme(world && !world.flags.unemployed ? world.clubs[world.userClubId] : undefined)
  }, [userClubId, clubTheme, world?.flags.unemployed])

  // play time: counted while a career is open and the app is in the foreground (saved with the career)
  useEffect(() => {
    if (!world) return
    let last = Date.now()
    const tick = () => {
      const now = Date.now()
      const w = useGame.getState().world
      // gaps longer than a couple of minutes mean the device slept or the tab was frozen: don't count them
      if (w && document.visibilityState === 'visible' && now - last < 120000) w.meta.playTimeMin += (now - last) / 60000
      last = now
    }
    const id = window.setInterval(tick, 15000)
    const onVis = () => { if (document.visibilityState === 'visible') last = Date.now(); else tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => { tick(); window.clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [world?.meta.id])

  // Android back button / browser back → in-app back
  useEffect(() => {
    const onPop = () => {
      const s = useGame.getState()
      if (s.world && (s.overlay.length || s.stacks[s.tab].length)) s.back()
      history.pushState(null, '', location.href)
    }
    history.pushState(null, '', location.href)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return (
    <div className="app">
      {world ? <Career /> : <MainMenu />}
      <div id="sheet-host" />
      <Toast />
    </div>
  )
}

function Career() {
  const tab = useGame((s) => s.tab)
  const stacks = useGame((s) => s.stacks)
  const overlay = useGame((s) => s.overlay)
  useGame((s) => s.v)
  const stack = stacks[tab]
  const top = stack[stack.length - 1]
  const Root = TAB_ROOT[tab]
  const View: ComponentType<any> | undefined = top ? ROUTES[top.name] : undefined
  const ov = overlay[overlay.length - 1]
  const Ov = ov ? ROUTES[ov.name] : undefined
  return (
    <>
      <div className="layer layer-in" key={`${tab}:${stack.length}:${top?.name ?? 'root'}`}>
        {View ? <View params={top!.params} /> : <Root />}
      </div>
      <BottomNav />
      {Ov && (
        <div className="overlay overlay-in" key={`ov:${overlay.length}:${ov.name}`}>
          <Ov params={ov.params} />
        </div>
      )}
    </>
  )
}

function Toast() {
  const toast = useGame((s) => s.toast)
  if (!toast) return null
  return (
    <div className="toast" key={toast.id} style={{ borderColor: toast.kind === 'err' ? 'rgba(255,77,94,.5)' : toast.kind === 'ok' ? 'rgba(43,240,143,.4)' : undefined }}>
      <Icon name={toast.kind === 'err' ? 'warning' : toast.kind === 'ok' ? 'check' : 'info'} size={18} color={toast.kind === 'err' ? 'var(--neg)' : toast.kind === 'ok' ? 'var(--acc)' : 'var(--info)'} />
      {toast.text}
    </div>
  )
}
