import { useEffect, type ComponentType } from 'react'
import { useGame } from './store/game'
import { applyTheme } from './ui/theme'
import { BottomNav } from './ui/components/layout'
import { Icon } from './ui/icons/Icon'
import { MainMenu } from './ui/screens/Menu'
import { NewsDrop } from './ui/screens/NewsScreens'
import { ViewKey, viewKeyFor } from './ui/memory'
import { ROUTES, TAB_ROOT } from './ui/routes'
import { initNavFx, useEnterClass } from './ui/navFx'
import { Presence } from './ui/components/Presence'

initNavFx()

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
      <div id="fx-under" className="fx-host" />
      {world ? <Career /> : <MainMenu />}
      <div id="fx-over" className="fx-host" />
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
  const layerKey = `${tab}:${stack.length}:${top?.name ?? 'root'}`
  const ovKey = ov ? `ov:${overlay.length}:${ov.name}` : ''
  const layerIn = useEnterClass(layerKey, 'layer')
  const ovIn = useEnterClass(ovKey, 'overlay')
  return (
    <>
      <div className={`layer ${layerIn}`} key={layerKey}>
        <ViewKey.Provider value={viewKeyFor(tab, stack.length, top?.name ?? 'root', top?.params)}>
          {View ? <View params={top!.params} /> : <Root />}
        </ViewKey.Provider>
      </div>
      <BottomNav />
      <NewsDrop />
      {Ov && (
        <div className={`overlay ${ovIn}`} key={ovKey}>
          <ViewKey.Provider value={viewKeyFor('ov', overlay.length, ov.name, ov.params)}>
            <Ov params={ov.params} />
          </ViewKey.Provider>
        </div>
      )}
    </>
  )
}

function Toast() {
  const toast = useGame((s) => s.toast)
  return <Presence id={toast?.id}>{toast && <ToastView toast={toast} />}</Presence>
}
function ToastView({ toast }: { toast: NonNullable<ReturnType<typeof useGame.getState>['toast']> }) {
  return (
    <div className={`toast ${toast.kind === 'edit' ? 'edit' : ''}`} style={{ borderColor: toast.kind === 'err' ? 'rgba(255,77,94,.5)' : toast.kind === 'ok' ? 'rgba(43,240,143,.4)' : toast.kind === 'edit' ? 'rgba(244,197,66,.55)' : undefined }}>
      <Icon name={toast.kind === 'err' ? 'warning' : toast.kind === 'ok' ? 'check' : toast.kind === 'edit' ? 'edit' : 'info'} size={18} color={toast.kind === 'err' ? 'var(--neg)' : toast.kind === 'ok' ? 'var(--acc)' : toast.kind === 'edit' ? 'var(--gold)' : 'var(--info)'} />
      {toast.text}
    </div>
  )
}
