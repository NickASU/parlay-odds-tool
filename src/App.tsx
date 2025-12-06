import { useMemo, useState } from "react";

type Leg = {
  id: number;
  americanOdds: string; // your side
  opponentOdds: string; // other side of the market (optional, for no-vig)
};

function americanToDecimal(odds: number): number | null {
  if (!Number.isFinite(odds) || odds === 0) return null;
  if (odds > 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

function americanToImpliedProb(odds: number): number | null {
  if (!Number.isFinite(odds) || odds === 0) return null;
  if (odds > 0) {
    return 100 / (odds + 100);
  }
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

/**
 * Given odds for your side and opponent's side,
 * compute a "no-vig" probability for your side by normalizing.
 */
function noVigProbFromMarket(yourOdds: number, oppOdds: number): number | null {
  const pYouRaw = americanToImpliedProb(yourOdds);
  const pOppRaw = americanToImpliedProb(oppOdds);
  if (pYouRaw == null || pOppRaw == null) return null;

  const sum = pYouRaw + pOppRaw;
  if (!Number.isFinite(sum) || sum <= 0) return null;

  return pYouRaw / sum;
}

export default function App() {
  const [stake, setStake] = useState<string>("10");
  const [legs, setLegs] = useState<Leg[]>([
    { id: 1, americanOdds: "-110", opponentOdds: "-110" },
    { id: 2, americanOdds: "-110", opponentOdds: "-110" },
  ]);
  const [copied, setCopied] = useState(false);

  const parsedStake = useMemo(() => {
    const n = Number(stake);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [stake]);

  const { validLegs, allValid } = useMemo(() => {
    const validLegs = legs
      .map((leg) => {
        const oddsNum = Number(leg.americanOdds);
        const dec = americanToDecimal(oddsNum);
        const prob = americanToImpliedProb(oddsNum);
        const isValid =
          leg.americanOdds.trim() !== "" &&
          Number.isFinite(oddsNum) &&
          oddsNum !== 0 &&
          dec !== null &&
          prob !== null;

        return {
          id: leg.id,
          americanOdds: leg.americanOdds,
          opponentOdds: leg.opponentOdds,
          oddsNum,
          decimal: dec,
          impliedProb: prob,
          isValid,
        };
      })
      .filter((l) => l.isValid);

    const allValid = validLegs.length === legs.length && validLegs.length > 0;

    return { validLegs, allValid };
  }, [legs]);

  // Book (actual) parlay metrics
  const parlayMetrics = useMemo(() => {
    if (!parsedStake || !validLegs.length) return null;

    const combinedDecimal = validLegs.reduce((acc, leg) => {
      return acc * (leg.decimal ?? 1);
    }, 1);

    if (!Number.isFinite(combinedDecimal) || combinedDecimal <= 1) return null;

    const parlayImpliedProb = 1 / combinedDecimal;
    const potentialReturn = parsedStake * combinedDecimal;
    const profit = potentialReturn - parsedStake;

    return {
      combinedDecimal,
      parlayImpliedProb,
      potentialReturn,
      profit,
    };
  }, [parsedStake, validLegs]);

  // No-vig / "true" parlay metrics (only if every leg has valid opponent odds)
  const fairParlayMetrics = useMemo(() => {
    if (!parsedStake || !validLegs.length) return null;

    const allHaveOpp = legs.every(
      (leg) =>
        leg.opponentOdds.trim() !== "" &&
        Number.isFinite(Number(leg.opponentOdds)) &&
        Number(leg.opponentOdds) !== 0
    );
    if (!allHaveOpp) return null;

    const fairLegProbs: number[] = [];

    for (const leg of legs) {
      const yourOddsNum = Number(leg.americanOdds);
      const oppOddsNum = Number(leg.opponentOdds);
      const pNoVig = noVigProbFromMarket(yourOddsNum, oppOddsNum);
      if (pNoVig == null) return null;
      fairLegProbs.push(pNoVig);
    }

    const parlayProbFair = fairLegProbs.reduce((acc, p) => acc * p, 1);
    if (!Number.isFinite(parlayProbFair) || parlayProbFair <= 0) return null;

    const fairDecimal = 1 / parlayProbFair;
    const fairReturn = parsedStake * fairDecimal;
    const fairProfit = fairReturn - parsedStake;

    if (!parlayMetrics) {
      return {
        parlayProbFair,
        fairDecimal,
        fairReturn,
        fairProfit,
        edgePct: null as number | null,
      };
    }

    const actualMultiple = parlayMetrics.combinedDecimal;
    const edgePct =
      fairDecimal > 0 ? 1 - actualMultiple / fairDecimal : null;

    return {
      parlayProbFair,
      fairDecimal,
      fairReturn,
      fairProfit,
      edgePct,
    };
  }, [parsedStake, validLegs, legs, parlayMetrics]);

    // EV based on fair (no-vig) probability vs book payout
  const evMetrics = useMemo(() => {
    if (!parsedStake || !parlayMetrics || !fairParlayMetrics) return null;

    const pTrue = fairParlayMetrics.parlayProbFair;
    const stakeAmount = parsedStake;
    const winProfit = parlayMetrics.profit; // profit if it hits

    if (
      !Number.isFinite(pTrue) ||
      pTrue <= 0 ||
      pTrue >= 1 ||
      !Number.isFinite(winProfit) ||
      stakeAmount <= 0
    ) {
      return null;
    }

    // EV = pTrue * winProfit - (1 - pTrue) * stake
    const ev = pTrue * winProfit - (1 - pTrue) * stakeAmount;

    // EV per $100 staked
    const evPer100 = (ev / stakeAmount) * 100;
    const evPct = (ev / stakeAmount) * 100; // same number, just labeled as %

    return {
      evPerBet: ev,
      evPer100,
      evPct,
    };
  }, [parsedStake, parlayMetrics, fairParlayMetrics]);


  // TEXT TO COPY
  const summaryText = useMemo(() => {
    if (!parlayMetrics || !parsedStake || !validLegs.length) return "";

    const legsStr = legs
      .map((leg, i) => `Leg ${i + 1}: ${leg.americanOdds}`)
      .join(" | ");

    return [
      `Parlay`,
      `Stake $${parsedStake.toFixed(2)}`,
      `Implied ${(
        parlayMetrics.parlayImpliedProb * 100
      ).toFixed(2)}%`,
      `Return $${parlayMetrics.potentialReturn.toFixed(2)}`,
      `Profit $${parlayMetrics.profit.toFixed(2)}`,
      legsStr && `Legs ${legsStr}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }, [parlayMetrics, parsedStake, validLegs.length, legs]);

  function updateLeg(
    id: number,
    field: "americanOdds" | "opponentOdds",
    value: string
  ) {
    setLegs((prev) =>
      prev.map((leg) =>
        leg.id === id ? { ...leg, [field]: value } : leg
      )
    );
  }

  function addLeg() {
    setLegs((prev) => [
      ...prev,
      {
        id: prev.length ? prev[prev.length - 1].id + 1 : 1,
        americanOdds: "-110",
        opponentOdds: "-110",
      },
    ]);
  }

  function removeLeg(id: number) {
    setLegs((prev) =>
      prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)
    );
  }

  return (
    <div className="app">
      <div className="app-inner">
        {/* HEADER */}
        <header className="site-header">
          <div className="site-logo">Parlay Odds Tool</div>
          <nav className="site-nav">
            <a href="#calculator" className="site-nav-link">
              Calculator
            </a>
            <a href="#how-it-works" className="site-nav-link">
              How it works
            </a>
          </nav>
        </header>

        <main className="site-main">
          {/* HERO – you can change this text however you want */}
          <section className="hero" id="top">
            <div className="hero-content">
              <h1 className="hero-title">Check Your Bets</h1>
              <p className="hero-subtitle">
                Implied odds and more... with a fun theme
              </p>

              <div className="hero-cta-row">
                <a href="#calculator" className="btn hero-cta">
                  Open Calculator
                </a>
                <p className="hero-note">
                  No sportsbook affiliates
                </p>
              </div>

              <div className="hero-badges">
                <span className="hero-badge">Implied chance</span>
                <span className="hero-badge">Payout &amp; profit</span>
                <span className="hero-badge">No-vig view (optional)</span>
              </div>
            </div>
          </section>

          {/* CALCULATOR */}
          <section className="calculator-section" id="calculator">
            <header className="app-header">
              <h2 className="app-title">Parlay Calculator</h2>
              <p className="app-subtitle">
                Enter your odds
              </p>
            </header>

            <div className="app-grid">
              {/* LEFT COLUMN – setup */}
              <section className="card">
                <div className="card-section">
                  <label className="field-label" htmlFor="stake">
                    Stake (amount risked)
                  </label>
                  <input
                    id="stake"
                    type="number"
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    placeholder="10"
                    className="input"
                  />
                  {!parsedStake && stake.trim() !== "" && (
                    <p className="field-error">
                      Enter a positive stake amount.
                    </p>
                  )}
                </div>

                <div className="card-section card-section--with-header">
                  <div className="card-section-header">
                    <h3 className="card-title">Legs</h3>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={addLeg}
                    >
                      + Add leg
                    </button>
                  </div>
                </div>

                <div className="card-section">
                  <div className="legs-list">
                    {legs.map((leg, index) => {
                      const oddsNum = Number(leg.americanOdds);
                      const decimal = americanToDecimal(oddsNum);
                      const prob = americanToImpliedProb(oddsNum);
                      const isValid =
                        leg.americanOdds.trim() !== "" &&
                        Number.isFinite(oddsNum) &&
                        oddsNum !== 0 &&
                        decimal !== null &&
                        prob !== null;

                      return (
                        <div key={leg.id} className="leg-card">
                          <div className="leg-main">
                            <div className="leg-label-row">
                              <span className="leg-label">
                                Leg {index + 1}
                              </span>
                            </div>

                            <label className="field-label">
                              Your odds (American)
                            </label>
                            <input
                              type="number"
                              value={leg.americanOdds}
                              onChange={(e) =>
                                updateLeg(
                                  leg.id,
                                  "americanOdds",
                                  e.target.value
                                )
                              }
                              placeholder="-110"
                              className="input"
                            />

                            {!isValid &&
                              leg.americanOdds.trim() !== "" && (
                                <p className="field-error">
                                  Enter non-zero American odds like -110,
                                  +150, -200, etc.
                                </p>
                              )}

                            {isValid && (
                              <p className="field-helper">
                                Implied probability:{" "}
                                <strong>
                                  {(prob! * 100).toFixed(1)}%
                                </strong>{" "}
                                · Decimal odds:{" "}
                                <strong>{decimal!.toFixed(2)}</strong>
                              </p>
                            )}

                            <label
                              className="field-label"
                              style={{ marginTop: 8 }}
                            >
                              Opponent odds (optional, for no-vig fair
                              payout)
                            </label>
                            <input
                              type="number"
                              value={leg.opponentOdds}
                              onChange={(e) =>
                                updateLeg(
                                  leg.id,
                                  "opponentOdds",
                                  e.target.value
                                )
                              }
                              placeholder="-110"
                              className="input"
                            />
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
                      Fill out valid American odds for all legs to see
                      combined parlay results.
                    </p>
                  )}
                </div>
              </section>

              {/* RIGHT COLUMN – summary */}
              <section className="card">
                <div className="card-section card-section--with-header">
                  <h3 className="card-title">Parlay summary</h3>
                </div>

                <div className="card-section">
                  {!parsedStake && (
                    <p className="field-helper">
                      Enter a valid stake to see potential payout.
                    </p>
                  )}

                  {!validLegs.length && (
                    <p className="field-helper">
                      Add at least one valid leg to calculate the parlay.
                    </p>
                  )}

                  {parlayMetrics && (
                    <>
                      {/* copy summary row */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 6,
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "#6de0b0",
                          }}
                        >
                          Copy this parlay as text
                        </span>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            if (!summaryText) return;
                            navigator.clipboard
                              .writeText(summaryText)
                              .then(() => {
                                setCopied(true);
                                setTimeout(
                                  () => setCopied(false),
                                  1500
                                );
                              })
                              .catch(() => {
                                // ignore clipboard errors
                              });
                          }}
                        >
                          {copied ? "Copied" : "Copy"}
                        </button>
                      </div>

                      <div className="summary-grid">
                        <div className="summary-item">
                          <span className="summary-label">
                            Your parlay implied probability
                          </span>
                          <span className="summary-value">
                            {(
                              parlayMetrics.parlayImpliedProb * 100
                            ).toFixed(2)}
                            %
                            <span className="summary-sub">
                              {" "}
                              (about 1 in{" "}
                              {(
                                1 / parlayMetrics.parlayImpliedProb
                              ).toFixed(1)}
                              )
                            </span>
                          </span>
                        </div>

                        <div className="summary-item">
                          <span className="summary-label">
                            Payout based on stake (return)
                          </span>
                          <span className="summary-value">
                            $
                            {parlayMetrics.potentialReturn.toFixed(2)}
                          </span>
                        </div>

                        <div className="summary-item">
                          <span className="summary-label">
                            Profit (winnings)
                          </span>
                          <span className="summary-value">
                            ${parlayMetrics.profit.toFixed(2)}
                          </span>
                        </div>

                        <div className="summary-item">
                          <span className="summary-label">
                            Combined decimal odds (from your odds)
                          </span>
                          <span className="summary-value">
                            {parlayMetrics.combinedDecimal.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </>
                  )}

                  {!parlayMetrics &&
                    parsedStake &&
                    validLegs.length > 0 && (
                      <p className="field-error">
                        Something&apos;s off with the current inputs.
                        Double-check your odds.
                      </p>
                    )}
                </div>

                {/* Fair / no-vig section */}
                <div className="card-section">
                  <h3 className="card-title" style={{ marginBottom: 8 }}>
                    No-vig / Fair payout (optional)
                  </h3>

                  {!fairParlayMetrics && (
                    <p className="field-helper">
                      To estimate a no-vig parlay payout, enter opponent
                      odds for every leg. We&apos;ll strip out the house
                      edge using both sides of the market.
                    </p>
                  )}

                  {fairParlayMetrics && (
                    <div className="summary-grid">
                      <div className="summary-item">
                        <span className="summary-label">
                          Fair parlay probability (no-vig)
                        </span>
                        <span className="summary-value">
                          {(
                            fairParlayMetrics.parlayProbFair * 100
                          ).toFixed(2)}
                          %
                        </span>
                      </div>
                      <div className="summary-item">
                        <span className="summary-label">
                          Fair decimal odds (no-vig)
                        </span>
                        <span className="summary-value">
                          {fairParlayMetrics.fairDecimal.toFixed(2)}
                        </span>
                      </div>
                      <div className="summary-item">
                        <span className="summary-label">
                          Fair potential return (no-vig)
                        </span>
                        <span className="summary-value">
                          $
                          {fairParlayMetrics.fairReturn.toFixed(2)}
                        </span>
                      </div>
                      <div className="summary-item">
                        <span className="summary-label">
                          Fair profit (no-vig)
                        </span>
                        <span className="summary-value">
                          $
                          {fairParlayMetrics.fairProfit.toFixed(2)}
                        </span>
                      </div>

                      {fairParlayMetrics.edgePct != null && (
                        <div className="summary-item">
                          <span className="summary-label">
                            Estimated book edge on this parlay
                          </span>
                          <span className="summary-value">
                            {(
                              fairParlayMetrics.edgePct * 100
                            ).toFixed(2)}
                            %
                          </span>
                        </div>
                      )}
                      {/* ===== EV ANALYSIS ===== */}
<h3 className="card-title" style={{ marginTop: 16 }}>
  EV Analysis
</h3>

{evMetrics ? (
  <div className="summary-grid">

    <div className="summary-item">
      <span className="summary-label">EV per bet (expected profit)</span>
      <span className="summary-value">
        {evMetrics.evPerBet >= 0 ? "+" : "-"}$
        {Math.abs(evMetrics.evPerBet).toFixed(2)}
      </span>
    </div>

    <div className="summary-item">
      <span className="summary-label">EV per $100 staked</span>
      <span className="summary-value">
        {evMetrics.evPer100 >= 0 ? "+" : "-"}$
        {Math.abs(evMetrics.evPer100).toFixed(2)}
      </span>
    </div>

  </div>
) : (
  <p className="field-helper">
    Add opponent odds for all legs to unlock EV analysis.
  </p>
)}

                            {evMetrics && (
        <>
          <div className="summary-item">
            <span className="summary-label">
              EV per bet (based on fair probs)
            </span>
            <span className="summary-value">
              {evMetrics.evPerBet >= 0 ? "+" : "-"}$
              {Math.abs(evMetrics.evPerBet).toFixed(2)}
            </span>
          </div>

          <div className="summary-item">
            <span className="summary-label">
              EV per $100 staked
            </span>
            <span className="summary-value">
              {evMetrics.evPer100 >= 0 ? "+" : "-"}$
              {Math.abs(evMetrics.evPer100).toFixed(2)}
            </span>
          </div>
        </>
      )}


                    </div>
                  )}
                </div>
              </section>
            </div>
          </section>

          {/* INFO / HOW IT WORKS – you can rewrite all this freely */}
          <section className="info-section" id="how-it-works">
            <h2 className="info-title">How it works</h2>
            <div className="info-grid">
              <div className="info-block">
                <h3>The numbers underneath</h3>
                <p>
                  American odds map to an actual percentage. The calculator
                  turns your parlay into one implied chance.
                </p>
              </div>
              <div className="info-block">
                <h3>Follow the payout</h3>
                <p>
                  Stake, total return, and profit are split out so you&apos;re
                  not guessing from a slip.
                </p>
              </div>
              <div className="info-block">
                <h3>Fight the vig (if you want)</h3>
                <p>
                  Add both sides of a market to see a no-vig fair view and how
                  tight the parlay price might be.
                </p>
              </div>
            </div>

            <p className="info-disclaimer">
              This is information, not advice. Know your limits and your
              local laws.
            </p>
          </section>
        </main>

        <footer className="site-footer">
          <span>Parlay Odds Tool</span>
          <span>Built to help make smart decisions.</span>
        </footer>
      </div>
    </div>
  );
}
