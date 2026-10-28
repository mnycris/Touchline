// The small (i) beside a heading that opens the longer explanation in a sheet: the screen keeps to what matters and the
// how and why is a tap away (the same button the tactics guide uses).
import { useState, type ReactNode } from 'react'
import { haptic } from '../../store/game'
import { Icon } from '../icons/Icon'
import { Sheet } from './layout'

/** `bar`: as a top bar button, beside the others there. */
export function InfoTip({ title, label, children, bar }: { title: string; label?: string; children: ReactNode; bar?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={bar ? 'iconbtn' : 'tb-info'} aria-label={label || `About ${title.toLowerCase()}`} onClick={(e) => { e.stopPropagation(); haptic(); setOpen(true) }}>
        <Icon name="info" size={bar ? 19 : 15} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="info-body">{children}</div>
      </Sheet>
    </>
  )
}
