import type { CompIdentity } from '../compIdentity'

/** A competition identity's artwork, behind whatever carries it: the brand's light, its mark large and cropped, the
 * slow light of the big nights. Purely decorative; the colours and placement come from screens.css (.ci-<id>). The
 * marks share one layer (.ci-marks), which a page's entrance moves as one without touching their own animations. */
export function IdentityArt({ ci }: { ci: CompIdentity }) {
  return (
    <span className="ci-art" aria-hidden>
      <i className="ci-glow" />
      {ci.mark && (
        <span className="ci-marks">
          <i className="ci-mark" />
          {ci.motion === 'prism' && <i className="ci-mark ci-mark-glass" />}
          {ci.mark2 && <i className="ci-mark ci-mark2" />}
        </span>
      )}
      {ci.motion && <i className="ci-light" />}
    </span>
  )
}
