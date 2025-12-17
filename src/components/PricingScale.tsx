// PricingScale.tsx
type PricingScaleProps = {
  /** value = percentage difference vs independence (can exceed visual cap, can be negative) */
  adjustmentPct: number;
  /** show explanation text (main app) */
  showExplanation?: boolean;
  /** visual cap for readability (default 30%) */
  visualCapPct?: number;
  /** slightly more compact layout (for share slip) */
  compact?: boolean;
};

export default function PricingScale({
  adjustmentPct,
  showExplanation = false,
  visualCapPct = 30,
  compact = false,
}: PricingScaleProps) {
  const cap = Math.max(5, visualCapPct);

  // Anchor is 0% (straight multiplication / independence baseline)
  // Negative can happen (promos/rounding). Pin left visually but show real number.
  const clampedForBar = Math.min(Math.max(adjustmentPct, 0), cap);
  const positionPct = (clampedForBar / cap) * 100;

  const isCappedHigh = adjustmentPct > cap;
  const isBelowZero = adjustmentPct < 0;

  const label = isBelowZero
    ? `${adjustmentPct.toFixed(0)}%`
    : `${adjustmentPct.toFixed(0)}%`;

  return (
    <div className={`pricing-scale ${compact ? "pricing-scale--compact" : ""}`}>
      <div className="pricing-scale-title">Parlay pricing assumption</div>

      <div className="pricing-scale-bar">
        <div className="pricing-scale-anchor">
          <span className="pricing-scale-anchor-label">Best Odds 0%</span>
        </div>

        <div className="pricing-scale-track" aria-label="Pricing scale">
          {/* subtle fixed ticks */}
          <div className="pricing-scale-ticks" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>

          {/* marker */}
          <div className="pricing-scale-marker" style={{ left: `${positionPct}%` }}>
            <span className="pricing-scale-marker-dot" />
            <span className="pricing-scale-marker-label">{label}</span>
          </div>

          {isCappedHigh && <div className="pricing-scale-cap-indicator">+</div>}
          {isBelowZero && <div className="pricing-scale-neg-indicator">−</div>}
        </div>

        <div className="pricing-scale-right-label">100% Worst Odds</div>
      </div>

      {showExplanation && (
        <div className="pricing-scale-explanation">
          <p>
            We compare the sportsbook’s <strong>offered total odds</strong> to a baseline that
            multiplies the legs as if they were independent.
          </p>
          <p>
            The % shown is how far the book’s total price deviates from that baseline.
          </p>
          <p className="pricing-scale-note">
            The bar is capped visually for readability, but the label shows the true %.
          </p>
        </div>
      )}
    </div>
  );
}
