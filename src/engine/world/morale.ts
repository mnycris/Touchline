import type { Conversation, Player, PlayerPromise, World } from '../../domain/types'
import { Rng, clamp, hashString } from '../../domain/rng'
import { addDays, ageOn, fmtDate } from '../../domain/dates'
import { ROLE_EXPECTED_SHARE } from '../../domain/constants'
import { rosterOf } from './roster'
import { sendInbox } from './messages'
import { yearsLeft } from './transfers'
import { buildConversation } from './conversations'

export function minutesShare(w: World, p: Player): number {
  const m = p.recentMins?.slice(-6)
  if (!m || !m.length) return ROLE_EXPECTED_SHARE[p.contract.role] || 0.4
  return m.reduce((a, b) => a + b, 0) / (m.length * 90)
}

export function clubForm(w: World, clubId: number): number {
  const r = w.clubs[clubId]?.recent || []
  return r.slice(-5).reduce((a, x) => a + (x === 'W' ? 1 : x === 'L' ? -1 : 0), 0)
}

/** Weekly morale model for a club's squad (all clubs, lightweight for AI). */
export function weeklyMorale(w: World, clubId: number, rng: Rng, detailed: boolean) {
  const form = clubForm(w, clubId)
  for (const p of rosterOf(w, clubId)) {
    let target = 64 + form * 3
    if (detailed) {
      const share = minutesShare(w, p)
      const exp = ROLE_EXPECTED_SHARE[p.contract.role] || 0.4
      const gap = share - exp
      target += clamp(gap * 45, -30, 14)
      const yl = yearsLeft(w, p)
      if (yl <= 1 && (p.contract.role === 'Crucial' || p.contract.role === 'Important')) target -= 8
      if (p.injury) target -= 4
      const broken = w.promises.filter((x) => x.playerId === p.id && x.status === 'broken' && x.deadline >= addDays(w.date, -120)).length
      target -= broken * 18
      if (w.flags.transferRefused?.[p.id]) target -= 12
    }
    target = clamp(target, 5, 97)
    p.morale = clamp(p.morale + (target - p.morale) * 0.22 + rng.normal(0, 1.2), 0, 100)
  }
}

// ---------------------------------------------------------------- conversations
const CONV_COOLDOWN = 35
const SUBJECT: Record<string, string> = {
  'Transfer Request': 'wants to leave', Dropped: 'asks why he was dropped', 'No Football': 'needs to play', 'Playing Time': 'wants more football', Interest: 'has heard about interest',
  Contract: 'asks about his contract', Development: 'asks about a loan', Confidence: 'needs your backing', Thanks: 'wants a word',
}

export function maybeConversations(w: World, rng: Rng) {
  const club = w.clubs[w.userClubId]
  if (!club) return
  const open = new Set(w.conversations.filter((c) => !c.resolved).map((c) => c.playerId))
  const recent = w.flags.convRecent || (w.flags.convRecent = {})
  for (const p of rosterOf(w, club.id)) {
    if (open.has(p.id)) continue
    if (recent[p.id] && recent[p.id] > addDays(w.date, -CONV_COOLDOWN)) continue
    const conv = buildConversation(w, p, rng)
    if (conv) {
      const c: Conversation = { ...conv, id: `c${w.nextIds.misc++}`, opened: w.date }
      w.conversations.push(c)
      recent[p.id] = w.date
      sendInbox(w, {
        from: p.name, fromRole: 'Player', category: 'Player', subject: SUBJECT[conv.kind] ? `${p.name} ${SUBJECT[conv.kind]}` : `${p.name}: ${conv.kind.toLowerCase()}`,
        body: c.prompt, actions: [{ label: 'Respond', action: 'openConversation', payload: c.id, primary: true }], playerId: p.id,
        urgent: conv.kind !== 'Thanks', image: { kind: 'player', id: p.id },
      })
      return // at most one new conversation per day
    }
  }
}

export function respondConversation(w: World, convId: string, optionId: string): string {
  const c = w.conversations.find((x) => x.id === convId)
  if (!c || c.resolved) return ''
  const p = w.players[c.playerId]
  const opt = c.options.find((o) => o.id === optionId)
  if (!opt || !p) return ''
  c.resolved = true
  c.choice = optionId
  const promise = (kind: PlayerPromise['kind'], days: number, req: number) => {
    w.promises.push({ id: `pr${w.nextIds.misc++}`, playerId: p.id, kind, made: w.date, deadline: addDays(w.date, days), requirement: req, progress: 0, status: 'active', baseline: startsOf(p) })
  }
  // replies vary with the player's personality; hot-headed players answer differently from model professionals
  const hot = p.hidden.temperament > 68, pro = p.hidden.professionalism > 65
  const h = hashString(`${convId}:${optionId}`)
  const say = (lines: string[]) => `"${lines[h % lines.length]}"`
  let reply = ''
  switch (opt.effect) {
    case 'list': p.transferListed = true; p.morale = clamp(p.morale + 18, 0, 100); reply = say(["Thank you, boss. I'll stay professional until a deal is done.", "I appreciate the honesty. I'll give everything until I go.", 'Thanks. It is the right decision for both of us.', "I'll always respect this club. Thank you for understanding."]); break
    case 'promiseRole': promise('Bigger Role', 60, 4); p.morale = clamp(p.morale + 14, 0, 100); reply = say(["I'll hold you to that.", "That's what I wanted to hear. I won't let you down.", 'Okay. I believe you, boss.', "Then I'm all in. Let's go."]); break
    case 'refuse': p.morale = clamp(p.morale - (hot ? 16 : 10), 0, 100); (w.flags.transferRefused ||= {})[p.id] = w.date; reply = hot ? say(["You'll regret this.", "So that's how it is. My agent will hear about this.", "You can't keep me here forever.", "Unbelievable. I thought you were different."]) : say(["I'm disappointed, but I'll respect the decision. For now.", "I understand, but I won't pretend I'm happy.", "Fine. I'll keep my head down, but this isn't over."]); break
    case 'promiseStarts': promise('More Starts', 30, 3); p.morale = clamp(p.morale + 12, 0, 100); reply = say(["That's all I ask. I won't let you down.", "Thank you. You'll see what I can do.", 'Deal. Just give me the chance.', "I'll be ready from the first minute."]); break
    case 'promiseCup': promise('Cup Appearances', 60, 2); p.morale = clamp(p.morale + 7, 0, 100); reply = say(["Okay, I'll be ready.", "It's a start. I'll take it.", "Fine, but I want more than cup games eventually."]); break
    case 'earn': p.morale = clamp(p.morale - (pro ? 1 : 6), 0, 100); reply = pro ? say(["Understood. I'll show you in training.", "Fair enough. I'll make it impossible for you to leave me out.", "Okay, boss. Watch this week."]) : say(["I've been working hard. I'm not sure what more you want.", "Everyone else gets chances. Why not me?", "Right. We'll see."]); break
    case 'loanList': p.loanListed = true; p.morale = clamp(p.morale + 8, 0, 100); promise('Loan Move', 45, 1); reply = say(["Thanks, boss. I want to come back a better player.", 'Regular football is what I need right now. Thank you.', "I'll make you want me back next season."]); break
    case 'openRenewal': p.morale = clamp(p.morale + 6, 0, 100); w.flags.openRenewal = p.id; reply = say(['Great, my agent will be in touch.', "Brilliant. I want to stay, let's get it done.", "That means a lot. I'll tell my agent to call the club."]); break
    case 'promiseContract': promise('New Contract', 150, 1); p.morale = clamp(p.morale + 8, 0, 100); reply = say(["I'm glad to hear that.", "Good. I don't want to be left waiting too long.", "Okay. I'll trust you on that."]); break
    case 'later': p.morale = clamp(p.morale - (hot ? 10 : 6), 0, 100); reply = hot ? say(["Later? I've heard that before.", "Don't make me wait too long, boss."]) : say(['I hope we can sort it soon.', "Okay. I'll be patient, but not forever."]); break
    case 'reassure': p.morale = clamp(p.morale + (pro ? 8 : 5), 0, 100); reply = hot ? say(["Words are easy. Show me.", "Alright. I'll take you at your word, for now.", "Fine. But I want to see it on the team sheet."]) : say(["That's good to hear. Thank you for being straight with me.", "Okay, I understand. I'll be ready.", "Thanks, boss. That helps."]); break
    case 'promiseCupNext': promise('Cup Appearances', 21, cupAppsOf(w, p) + 1); p.morale = clamp(p.morale + 9, 0, 100); reply = say(["I'll be ready. Thank you.", "Good. I'll make the most of it.", "That's a start. I'll show you what I can do."]); break
    case 'rest': p.morale = clamp(p.morale + (hot ? -3 : 3), 0, 100); p.formRatings = (p.formRatings || []).slice(-2); reply = hot ? say(["So I'm being dropped. Great.", "If that's what you think."]) : say(["Maybe you're right. A reset could help.", "Okay. I'll come back fresher."]); break
    case 'praise': p.morale = clamp(p.morale + 3, 0, 100); reply = say(['Thanks, boss.', 'That means a lot coming from you.', "Appreciate it. I'll keep it going.", 'Thanks. The team makes it easy.']); break
    case 'demand': p.morale = clamp(p.morale - (hot ? 3 : 1), 0, 100); p.hidden.professionalism = clamp(p.hidden.professionalism + 2, 0, 99); reply = hot ? say(['Alright, alright. Message received.', "I'm already giving everything, but okay."]) : say(["You're right. I'll keep pushing.", "Understood. There's more in me.", "I know. I'll step it up."]); break
  }
  return reply
}

function startsOf(p: Player) {
  return Object.values(p.season).reduce((a, s) => a + s.starts, 0)
}
function cupAppsOf(w: World, p: Player) {
  return Object.entries(p.season).reduce((a, [k, s]) => a + (w.competitions[k]?.format === 'cup' ? s.apps : 0), 0)
}

export function checkPromises(w: World) {
  for (const pr of w.promises) {
    if (pr.status !== 'active') continue
    const p = w.players[pr.playerId]
    if (!p || p.clubId !== w.userClubId) { pr.status = pr.kind === 'Transfer' || pr.kind === 'Loan Move' ? 'fulfilled' : 'fulfilled'; continue }
    switch (pr.kind) {
      case 'More Starts': case 'Bigger Role': pr.progress = startsOf(p) - (pr.baseline || 0); break
      case 'Cup Appearances': pr.progress = cupAppsOf(w, p); break
      case 'New Contract': pr.progress = p.contract.signedOn > pr.made ? 1 : 0; break
      case 'Loan Move': pr.progress = p.loan ? 1 : 0; break
    }
    if (pr.progress >= pr.requirement) {
      pr.status = 'fulfilled'
      p.morale = clamp(p.morale + 8, 0, 100)
    } else if (w.date > pr.deadline) {
      pr.status = 'broken'
      p.morale = clamp(p.morale - 25, 0, 100)
      sendInbox(w, {
        from: p.name, fromRole: 'Player', category: 'Player', subject: `${p.name} feels let down`,
        body: `"You promised me ${pr.kind.toLowerCase()} by ${fmtDate(pr.deadline, 'dm')}. That hasn't happened and I'm very disappointed."`,
        actions: [{ label: 'View Player', action: 'openPlayer', payload: p.id, primary: true }], playerId: p.id, image: { kind: 'player', id: p.id },
      })
    }
  }
}
