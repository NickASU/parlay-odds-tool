// InputsPanel.tsx
import { useMemo } from "react";
import { analyzeTwoSidedMarket } from "../utils/odds";
import { useParlay } from "../state/parlayStore";
import { parseLegs, parseStake } from "../lib/parlayMath";
import { americanToDecimal } from "../utils/odds";

export default function InputsPanel() {
  const { stake, setStake, bookTotalOdds, setBookTotalOdds, legs, addLeg, removeLeg, updateLeg } = useParlay();

  const parsedStake = useMemo(() => parseStake(stake), [stake]);
const { parsedLegs, allValid } = useMemo(() => parseLegs(legs), [legs]);

  const bookTotalIsValid = useMemo(() => {
    if (!bookTotalOdds.trim()) return true; // optional
    const n = Number(bookTotalOdds);
    const dec = americanToDecimal(n);
    return Number.isFinite(n) && n !== 0 && dec != null && dec > 1;
  }, [bookTotalOdds]);

  function valueSignClass(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "";
    return value >= 0 ? "value-positive" : "value-negative";
  }

  return (
    <section className="card">
      <div className="card-section">
        <label className="field-label" htmlFor="stake">Stake (amount risked)</label>
        <input
          id="stake"
          type="number"
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          placeholder="10"
          className="input"
        />
        {!parsedStake && stake.trim() !== "" && (
          <p className="field-error">Enter a positive stake amount.</p>
        )}
      </div>

      <div className="card-section">
        <label className="field-label" htmlFor="bookTotalOdds">
          Book offered total odds (optional, American)
        </label>
        <input
          id="bookTotalOdds"
          type="number"
          value={bookTotalOdds}
          onChange={(e) => setBookTotalOdds(e.target.value)}
          placeholder="e.g. +450"
          className="input"
        />
        {!bookTotalIsValid && (
          <p className="field-error">Enter non-zero American odds like -110, +150, -200, etc.</p>
        )}
        <p className="field-helper" style={{ marginTop: 3, opacity: 0.95 }}>
          This powers the pricing scale for SGPs / parlays with no “counter” market.
        </p>
      </div>

      <div className="card-section card-section--with-header">
        <div className="card-section-header">
          <h3 className="card-title">Legs</h3>
          <button type="button" className="btn btn-outline" onClick={addLeg}>+ Add leg</button>
        </div>
      </div>

      <div className="card-section">
        <div className="legs-list">
          {parsedLegs.map((leg, index) => {
            const isValid = leg.isValid;
            const prob = leg.impliedProb;

            const canMarket =
              leg.useOpponent &&
              leg.opponentOdds.trim() !== "" &&
              Number.isFinite(Number(leg.opponentOdds)) &&
              Number(leg.opponentOdds) !== 0 &&
              isValid;

            const market = canMarket
              ? analyzeTwoSidedMarket(leg.oddsNum, Number(leg.opponentOdds))
              : null;

            return (
              <div key={leg.id} className="leg-card">
                <div className="leg-main">
                  <div className="leg-label-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="leg-label">Leg {index + 1}</span>

                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: "0.72rem",
                        color: "#6de0b0",
                        cursor: "pointer",
                        userSelect: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={leg.useOpponent}
                        onChange={(e) => updateLeg(leg.id, "useOpponent", e.target.checked)}
                      />
                      Counter odds
                    </label>
                  </div>

                  <label className="field-label">Leg label (optional)</label>
                  <input
                    type="text"
                    value={leg.label}
                    onChange={(e) => updateLeg(leg.id, "label", e.target.value)}
                    placeholder="e.g. Ravens ML, Over 45.5"
                    className="input"
                  />

                  <label className="field-label">Your odds (American)</label>
                  <input
                    type="number"
                    value={leg.americanOdds}
                    onChange={(e) => updateLeg(leg.id, "americanOdds", e.target.value)}
                    placeholder="-110"
                    className="input"
                  />

                  {!isValid && leg.americanOdds.trim() !== "" && (
                    <p className="field-error">Enter non-zero American odds like -110, +150, -200, etc.</p>
                  )}

                  {isValid && prob != null && (
                    <p className="field-helper">
                      Implied: <strong>{(prob * 100).toFixed(1)}%</strong>
                    </p>
                  )}

                  {leg.useOpponent && (
                    <>
                      <label className="field-label" style={{ marginTop: 6 }}>
                        Counter odds (other side)
                      </label>
                      <input
                        type="number"
                        value={leg.opponentOdds}
                        onChange={(e) => updateLeg(leg.id, "opponentOdds", e.target.value)}
                        placeholder="-110"
                        className="input"
                      />

                      {market && (
                        <p className="field-helper">
                          Vig on this market: <strong>{(market.hold * 100).toFixed(1)}%</strong> · Edge vs fair:{" "}
                          <strong className={valueSignClass(market.houseEdgePct)}>
                            {market.houseEdgePct >= 0 ? "+" : "-"}
                            {Math.abs(market.houseEdgePct).toFixed(1)}%
                          </strong>
                        </p>
                      )}
                    </>
                  )}
                </div>

                <div className="leg-actions">
                  <button
                    type="button"
                    onClick={() => removeLeg(leg.id)}
                    disabled={legs.length <= 1}
                    className="btn btn-outline btn-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {!allValid && (
          <p className="field-error field-error--top">
            Fill out valid American odds for all legs to see combined parlay results.
          </p>
        )}
      </div>
    </section>
  );
}
