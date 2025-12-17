//ShareCard.tsx
import type { Leg, ParlayMetrics } from "../lib/parlayMath";
import { americanToImpliedProb } from "../utils/odds";
import { decimalToAmerican, formatAmerican } from "../lib/parlayMath";
import PricingScale from "./PricingScale";
import ScaleKey from "./ScaleKey";

export default function ShareCard({
  shareCardRef,
  legs,
  stake,
  parlay,
  bookTotalOddsAmerican = null,
  bookTotalDecimal = null,
  pricingAdjustmentPct,
  showPricingScaleOnSlip = false,
  showScaleKeyOnSlip = false,
}: {
  shareCardRef: React.RefObject<HTMLDivElement | null>;
  legs: Leg[];
  stake: number;
  parlay: ParlayMetrics | null; // this is the independent/multiplied baseline
  bookTotalOddsAmerican?: string | null;
  bookTotalDecimal?: number | null;
  pricingAdjustmentPct?: number | null;
  showPricingScaleOnSlip?: boolean;
  showScaleKeyOnSlip?: boolean;
}) {
  const sortedLegs = [...legs]
    .map((leg, originalIndex) => {
      const oddsNum = Number(leg.americanOdds);
      const prob = americanToImpliedProb(oddsNum);

      const displayName = leg.label.trim()
        ? leg.label.trim()
        : `Leg ${originalIndex + 1}`;

      return {
        ...leg,
        originalIndex,
        impliedProb: prob,
        displayName,
      };
    })
    .sort((a, b) => {
      if (a.impliedProb == null) return 1;
      if (b.impliedProb == null) return -1;
      return a.impliedProb - b.impliedProb;
    });

  const bestOddsAmerican = parlay
    ? formatAmerican(decimalToAmerican(parlay.combinedDecimal))
    : "—";

  const hasBook = bookTotalDecimal != null && Number.isFinite(bookTotalDecimal) && bookTotalDecimal > 1;

  const payout = (() => {
    if (!parlay) return null;
    const usedDecimal = hasBook ? (bookTotalDecimal as number) : parlay.combinedDecimal;
    const potentialReturn = stake * usedDecimal;
    const profit = potentialReturn - stake;
    return { potentialReturn, profit };
  })();

  const showScale =
    showPricingScaleOnSlip &&
    pricingAdjustmentPct != null &&
    Number.isFinite(pricingAdjustmentPct);

  return (
    <div ref={shareCardRef} className="share-card">
      <div className="share-card-header">Parlay slip</div>

      <div className="share-card-body">
        <div className="share-card-row">
          <span className="share-card-label">Stake</span>
          <span className="share-card-value">${stake.toFixed(2)}</span>
        </div>

        {hasBook ? (
          <>
            <div className="share-card-row">
              <span className="share-card-label">Book offered odds</span>
              <span className="share-card-value">{bookTotalOddsAmerican ?? "—"}</span>
            </div>
            <div className="share-card-row">
              <span className="share-card-label">Best odds (independent)</span>
              <span className="share-card-value">{bestOddsAmerican}</span>
            </div>
          </>
        ) : (
          <div className="share-card-row">
            <span className="share-card-label">Best odds</span>
            <span className="share-card-value">{bestOddsAmerican}</span>
          </div>
        )}

        {payout ? (
          <>
            <div className="share-card-row">
              <span className="share-card-label">Return</span>
              <span className="share-card-value">${payout.potentialReturn.toFixed(2)}</span>
            </div>

            <div className="share-card-row">
              <span className="share-card-label">Profit</span>
              <span className="share-card-value">${payout.profit.toFixed(2)}</span>
            </div>
          </>
        ) : (
          <div className="share-card-row">
            <span className="share-card-label">Outcome</span>
            <span className="share-card-value">—</span>
          </div>
        )}

        {showScale && (
          <div className="share-card-scale">
            <PricingScale adjustmentPct={pricingAdjustmentPct!} compact showExplanation={false} />
            {showScaleKeyOnSlip && <ScaleKey compact />}
          </div>
        )}

        <div className="share-card-legs">
          <div className="share-card-legs-title">
            Legs (sorted by implied win probability)
          </div>

          <ul className="share-card-legs-list">
            {sortedLegs.map((leg, displayIndex) => {
              const oddsPart =
                leg.useOpponent && leg.opponentOdds.trim()
                  ? `${leg.americanOdds} vs ${leg.opponentOdds}`
                  : leg.americanOdds || "—";

              return (
                <li key={leg.id} className="share-card-leg-row">
                  <div className="share-card-leg-main">
                    <span className="share-card-leg-index">{displayIndex + 1}.</span>
                    <span className="share-card-leg-label">{leg.displayName}</span>
                  </div>

                  <div className="share-card-leg-odds" style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span>{oddsPart}</span>
                    {leg.impliedProb != null && (
                      <span style={{ opacity: 0.85, fontSize: "0.75rem" }}>
                        {(leg.impliedProb * 100).toFixed(1)}% implied
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
