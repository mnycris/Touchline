// Inbox / notification action dispatcher.
import { useGame } from '../store/game'
import { acceptCounter, acceptIncomingBid, rejectIncomingBid } from '../engine/world/userActions'
import type { InboxAction } from '../domain/types'

export function runAction(a: InboxAction, msgId?: string) {
  const s = useGame.getState()
  const w = s.world
  if (!w) return
  const markDone = () => s.mutate((w) => { const m = w.inbox.find((x) => x.id === msgId); if (m) { m.resolved = true; m.read = true } })
  switch (a.action) {
    case 'openPlayer': s.go({ name: 'player', params: { id: a.payload } }); break
    case 'openBoard': s.go({ name: 'office' }); break
    case 'openTransfers': s.setTab('transfers'); s.resetTab(); break
    case 'openSquad': s.setTab('squad'); s.resetTab(); break
    case 'openTactics': s.go({ name: 'tactics' }); break
    case 'openScouting': s.setTab('transfers'); s.resetTab(); s.go({ name: 'scouting' }); break
    case 'openYouth': s.setTab('academy'); s.resetTab(); break
    case 'openComp': s.setTab('season'); s.resetTab(); s.go({ name: 'comp', params: { id: a.payload } }); break
    case 'openDevelopment': s.go({ name: 'development' }); break
    case 'openSettings': s.go({ name: 'settings' }); break
    case 'openCalendar': s.go({ name: 'calendar' }); break
    case 'openContracts': s.go({ name: 'contracts' }); break
    case 'openConversation': s.go({ name: 'conversation', params: { id: a.payload, msgId } }); break
    case 'openJobs': case 'openJobOffer': s.go({ name: 'jobs' }); break
    case 'openOffer': s.open({ name: 'negotiation', params: { playerId: a.payload } }); break
    case 'openContract': {
      const o = w.transfers.offers[a.payload]
      if (o) s.open({ name: 'negotiation', params: { playerId: o.playerId, offerId: o.id, stage: 'contract' } })
      break
    }
    case 'acceptCounter': {
      let r = { ok: false, text: '' }
      s.mutate((w) => { r = acceptCounter(w, a.payload) })
      s.notify(r.text, r.ok ? 'ok' : 'err')
      if (r.ok) { markDone(); const o = w.transfers.offers[a.payload]; s.open({ name: 'negotiation', params: { playerId: o.playerId, offerId: o.id, stage: 'contract' } }) }
      break
    }
    case 'acceptBid': {
      let r = { ok: false, text: '' }
      s.mutate((w) => { r = acceptIncomingBid(w, a.payload) }, { roster: true })
      s.notify(r.text, r.ok ? 'ok' : 'err')
      markDone()
      break
    }
    case 'rejectBid': {
      let r = { ok: false, text: '' }
      s.mutate((w) => { r = rejectIncomingBid(w, a.payload) })
      s.notify(r.text, r.ok ? 'info' : 'err')
      markDone()
      break
    }
    case 'negotiateBid': s.open({ name: 'sellNegotiation', params: { offerId: a.payload, msgId } }); break
    default: s.notify('Action unavailable', 'err')
  }
}
