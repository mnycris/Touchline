// What an update brings to a career already under way. A save opened by a newer build gets one email for every release
// it hasn't seen, each written for that release (what it changed, in the terms of a save in progress), with the save
// conversions that release made listed under it. Each is delivered once per save, whatever happens to the save after.
//
// Which release a save last saw: the version it records itself (from 4.2), else the version its save-list entry
// recorded (from 4.1), else what its schema says (the 4.2 work was built under the 4.1.2 label until the very end).
import type { World } from '../../domain/types'
import { sendInbox } from './messages'
import type { MigrationReport } from './migrate'
import { EXCLUDED_NATIONS } from './international'

interface Release { v: string; schema: number; subject: string; body: string }

const RELEASES: Release[] = [
  {
    v: '4.1', schema: 4, subject: 'Touchline 4.1: checkpoints, a live transfer centre and every shot recorded',
    body: 'Your career now keeps versions of itself: a checkpoint is taken before every update, and you can make your own or export the career from Settings → Checkpoints. The transfer centre follows the whole market as it moves, matches record every shot (shot map, goal replays and a proper match report), knockout rounds have brackets and a trophy worth lifting, and opponents come with a scouting report and a prediction. National teams have a FIFA-style ranking.',
  },
  {
    v: '4.1.1', schema: 4, subject: 'Touchline 4.1.1: goals shared out, cups the right size, a practice pitch',
    body: 'Goals are spread across a team the way they are in real football, penalties go to the right taker and are scored at a realistic rate, and bookings are back to sensible numbers. Domestic cups include every club that belongs in them, the Champions League plays its league phase with a balanced draw, and the match-day team sheet belongs to each match. New: a tactical practice match, with a tactics guide that matches what the engine does.',
  },
  {
    v: '4.1.2', schema: 4, subject: 'Touchline 4.1.2: energy on the team sheet',
    body: 'The Team Sheet shows every player’s energy, so the tired ones are obvious before kick-off rather than after. On the iPhone Home Screen app, the status bar takes each screen’s colour instead of blurring the header under it.',
  },
  {
    v: '4.2', schema: 7, subject: 'Touchline 4.2: a new match engine, and a world that remembers',
    body: 'The match engine has been rebuilt around how teams really play: shape, roles and pressing matter the way they would on a pitch, a side chasing the game pushes while one protecting a lead sits deeper, and goals and assists come out of real attacking moves. Results already played stay exactly as they were; the new engine takes over from your next match. Around it: a Tactics Lab that compares two set-ups, a half-time report, opponent reports built around how the match will go, universal search and following, your club inside the living transfer market, a loan market, a scouting network you can follow, trophies recorded the day they are won, the big competitions in their own colours, ten substitutes on the bench, and swipe back on iPhone. Your assistant now makes the changes for injuries and tired legs in your matches until you make a substitution yourself (Settings).',
  },
]

/** "4.1.2" → [4, 1, 2], compared part by part. */
const parts = (v: string) => v.split('.').map((n) => Number(n) || 0)
export function compareVersions(a: string, b: string) {
  const x = parts(a), y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0)
  return 0
}

/** The last release this save was opened with. */
export function lastSeenRelease(w: World, listed: string | undefined, schemaBefore: number): string {
  if (w.meta.appVersion) return w.meta.appVersion
  if (listed) return listed
  return schemaBefore >= 5 ? '4.1.2' : schemaBefore >= 4 ? '4.1' : '4.0'
}

const sentKey = (v: string) => `release:${v}`

/**
 * Send the emails for every release after `from` up to `current`, oldest first (so the newest is on top). The save
 * conversions each release made (migrations up to its schema) are listed under it. Returns how many were sent.
 */
export function sendReleaseMail(w: World, from: string, current: string, rep: MigrationReport, backedUp: boolean): number {
  const due = RELEASES.filter((r) => compareVersions(r.v, from) > 0 && compareVersions(r.v, current) <= 0 && !w.flags[sentKey(r.v)])
  let prevSchema = 0
  const converted = new Map<string, string[]>()
  for (const r of RELEASES) {
    converted.set(r.v, rep.steps.filter((s) => s.to > prevSchema && s.to <= r.schema).map((s) => s.name))
    prevSchema = r.schema
  }
  due.forEach((r, i) => {
    const conv = converted.get(r.v) || []
    const last = i === due.length - 1
    const body = [
      r.body,
      conv.length ? `Brought up to date in this save: ${conv.join('; ')}.` : '',
      'Everything else carries over as it was: squad, finances, fixtures, statistics and your history.',
      last && backedUp ? 'The save exactly as it was before the update is kept under Settings → Checkpoints.' : '',
    ].filter(Boolean).join('\n\n')
    sendInbox(w, {
      from: 'Touchline', fromRole: `Version ${r.v}`, category: 'Board', subject: r.subject, body,
      actions: last && backedUp ? [{ label: 'Checkpoints', action: 'openSettings', primary: true }] : [],
    })
    w.flags[sentKey(r.v)] = true
  })
  // conversions with no release of their own to go under (a save from a build between releases)
  if (!due.length && rep.applied.length) {
    sendInbox(w, {
      from: 'Touchline', fromRole: `Version ${current}`, category: 'Board', subject: 'Your career has been brought up to date',
      body: `Brought up to date in this save: ${rep.applied.join('; ')}.\n\nEverything else carries over as it was.${backedUp ? '\n\nThe save exactly as it was is kept under Settings → Checkpoints.' : ''}`,
      actions: backedUp ? [{ label: 'Checkpoints', action: 'openSettings', primary: true }] : [],
    })
  }
  return due.length
}

/**
 * Game-world notes for careers that were under way before a rule came in, once each. Careers started since then are
 * marked as having had them (see markNotesSeen), since the rule was there from their first day.
 */
const NOTES: { key: string; applies: (w: World) => boolean; send: (w: World) => void }[] = [
  {
    key: 'note:israelFriendliesOnly',
    applies: (w) => EXCLUDED_NATIONS.has('Israel') && !!w.intl?.nt.Israel,
    send: (w) => sendInbox(w, {
      from: 'Touchline', fromRole: 'Game world', category: 'Competitions',
      subject: 'Israel play friendlies only',
      body: 'In this game world Israel take no part in competitive international football: no qualifiers, no Nations League, no tournaments. Competitions they had not started go on without them, and anything already under way finishes as drawn.\n\nFriendlies go ahead as usual, and Israeli players at your club are still called up for them. Nothing for you to do.',
      actions: [],
    }),
  },
]

export function sendWorldNotes(w: World) {
  for (const n of NOTES) {
    if (w.flags[n.key]) continue
    w.flags[n.key] = true
    if (n.applies(w)) n.send(w)
  }
}

/** A new career starts with everything in place: no release emails and no notes about rules it always had. */
export function markNotesSeen(w: World, current: string) {
  w.meta.appVersion = current
  for (const r of RELEASES) if (compareVersions(r.v, current) <= 0) w.flags[sentKey(r.v)] = true
  for (const n of NOTES) w.flags[n.key] = true
}
