import type { CompIdentity } from '../compIdentity'

/** A competition identity's artwork, behind whatever carries it: the brand's light, its mark large and cropped, the
 * slow light of the big nights. Purely decorative; the colours and placement come from screens.css (.ci-<id>). */
export function IdentityArt({ ci }: { ci: CompIdentity }) {
  return (
    <span className="ci-art" aria-hidden>
      <i className="ci-glow" />
      {ci.mark && <i className="ci-mark" />}
      {ci.mark && ci.motion === 'prism' && <i className="ci-mark ci-mark-glass" />}
      {ci.motion && <i className="ci-light" />}
    </span>
  )
}
