import { useEffect, useMemo, useState } from "react";

import {
  americanToDecimal,
  americanToImpliedProb,
  analyzeTwoSidedMarket,
} from "./utils/odds";

type Leg = {
  id: number;
  label: string; // user label
  americanOdds: string; // your side
  opponentOdds: string; // other side of the market (optional, for no-vig)
};

const STORAGE_KEY = "twoSidedVigCalculatorState";

export default function App() {
  const [stake, setStake] = useState<string>("10");
  const [legs, setLegs] = useState<Leg[]>([
    { id: 1, label: "", americanOdds: "-110", opponentOdds: "-110" },
    { id: 2, label: "", americanOdds: "-110", opponentOdds: "-110" },
  ]);

  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false); // “Sharp mode”
  const [showAdvancedExplainer, setShowAdvancedExplainer] = useState(false); // collapsible explanation

  // Load from localStorage on mount
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        stake?: string;
        legs?: Leg[];
      };

      if (parsed.stake && Number(parsed.stake) > 0) {
        setStake(parsed.stake);
      }

      if (Array.isArray(parsed.legs) && parsed.legs.length > 0) {
        // basic validation
        const cleaned: Leg[] = parsed.legs
          .map((l, idx) => ({
            id: typeof l.id === "number" ? l.id : idx + 1,
            label: typeof l.label === "string" ? l.label : "",
            americanOdds: typeof l.americanOdds === "string" ? l.americanOdds : "",
            opponentOdds:
              typeof l.opponentOdds === "string" ? l.opponentOdds : "",
          }))
          .filter((l) => l.americanOdds.trim() !== "");

        if (cleaned.length > 0) {
          setLegs(cleaned);
        }
      }
    } catch {
      // ignore localStorage errors
    }
  }, []);

  // Persist to localStorage whenever stake or legs change
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const data = JSON.stringify({ stake, legs });
      window.localStorage.setItem(STORAGE_KEY, data);
    } catch {
      // ignore
    }
  }, [stake, legs]);

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
    const legHolds: number[] = [];

    for (const leg of legs) {
      const yourOddsNum = Number(leg.americanOdds);
      const oppOddsNum = Number(leg.opponentOdds);

      const market = analyzeTwoSidedMarket(yourOddsNum, oppOddsNum);
      if (!market) return null;

      fairLegProbs.push(market.pNoVigYou);
      legHolds.push(market.hold);
    }

    const parlayProbFair = fairLegProbs.reduce((acc, p) => acc * p, 1);
    if (!Number.isFinite(parlayProbFair) || parlayProbFair <= 0) return null;

    const fairDecimal = 1 / parlayProbFair;
    const fairReturn = parsedStake * fairDecimal;
    const fairProfit = fairReturn - parsedStake;

    const avgLegHold =
      legHolds.length > 0
        ? legHolds.reduce((a, b) => a + b, 0) / legHolds.length
        : null;

    if (!parlayMetrics) {
      return {
        parlayProbFair,
        fairDecimal,
        fairReturn,
        fairProfit,
        edgePct: null as number | null,
        avgLegHold,
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
      avgLegHold,
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

    // EV % (per $1)
    const evPct = (ev / stakeAmount) * 100;

    return {
      evPerBet: ev,
      evPct,
    };
  }, [parsedStake, parlayMetrics, fairParlayMetrics]);

  // TEXT TO COPY (basic summary)
  const summaryText = useMemo(() => {
    if (!parlayMetrics || !parsedStake || !validLegs.length) return "";

    const legsStr = legs
      .map((leg, i) => {
        const label = leg.label.trim();
        if (label) {
          const oppPart =
            leg.opponentOdds.trim() !== ""
              ? ` (${leg.americanOdds} vs ${leg.opponentOdds})`
              : ` (${leg.americanOdds})`;
          return `Leg ${i + 1}: ${label}${oppPart}`;
        }
        return `Leg ${i + 1}: ${leg.americanOdds}`;
      })
      .join(" | ");

    return [
      `Parlay`,
      `Stake $${parsedStake.toFixed(2)}`,
      `Implied ${(parlayMetrics.parlayImpliedProb * 100).toFixed(1)}%`,
      `Return $${parlayMetrics.potentialReturn.toFixed(2)}`,
      `Profit $${parlayMetrics.profit.toFixed(2)}`,
      legsStr && `Legs ${legsStr}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }, [parlayMetrics, parsedStake, validLegs.length, legs]);

  // Share-text for Reddit / Discord
  const shareText = useMemo(() => {
    if (!parlayMetrics || !parsedStake || !validLegs.length) return "";

    const lines: string[] = [];

    lines.push(`Stake: $${parsedStake.toFixed(2)}`);
    lines.push("Legs:");
    legs.forEach((leg, i) => {
      const label = leg.label.trim() || `Leg ${i + 1}`;
      const oddsPart = leg.opponentOdds.trim()
        ? `${leg.americanOdds} vs ${leg.opponentOdds}`
        : leg.americanOdds;
      lines.push(`${i + 1}) ${label} (${oddsPart})`);
    });

    lines.push("");
    lines.push(
      `Book parlay implied: ${(parlayMetrics.parlayImpliedProb * 100).toFixed(
        1
      )}%`
    );

    if (fairParlayMetrics) {
      lines.push(
        `Fair parlay implied (no-vig): ${(fairParlayMetrics.parlayProbFair * 100).toFixed(
          1
        )}%`
      );
      if (fairParlayMetrics.edgePct != null) {
        const edgePct = fairParlayMetrics.edgePct * 100;
        const sign = edgePct >= 0 ? "+" : "";
        lines.push(`Book edge vs fair: ${sign}${edgePct.toFixed(1)}%`);
      }
    }

    if (evMetrics) {
      const evPer100 = evMetrics.evPct; // EV per $100
      const sign = evPer100 >= 0 ? "+" : "";
      lines.push(`EV per $100: ${sign}$${Math.abs(evPer100).toFixed(1)}`);
    }

    return lines.join("\n");
  }, [parlayMetrics, fairParlayMetrics, evMetrics, parsedStake, legs]);

  function updateLeg(
    id: number,
    field: "americanOdds" | "opponentOdds" | "label",
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
        label: "",
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

  // Example parlay loader
  function loadExampleParlay() {
    setStake("25");
    setLegs([
      {
        id: 1,
        label: "Ravens ML",
        americanOdds: "-135",
        opponentOdds: "-115",
      },
      {
        id: 2,
        label: "Over 45.5",
        americanOdds: "-110",
        opponentOdds: "-110",
      },
      {
        id: 3,
        label: "Anytime TD scorer",
        americanOdds: "+180",
        opponentOdds: "-210",
      },
    ]);
    setShowAdvanced(true);
  }

  function valueSignClass(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "";
    return value >= 0 ? "value-positive" : "value-negative";
  }

  return (
    <div className="app">
      <div className="app-inner">
        {/* HEADER */}
        <header className="site-header">
          <div className="site-logo">Two-Sided Vig Calculator</div>
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
          {/* HERO */}
          <section className="hero" id="top">
            <div className="hero-content">
              <h1 className="hero-title">See the Book&apos;s Edge</h1>
              <p className="hero-subtitle">
                Check your parlay like a normal slip, then flip on sharp mode to see
                vig, fair odds, and EV from both sides of the market.
              </p>

              <div className="hero-cta-row">
                <a href="#calculator" className="btn hero-cta">
                  Open Calculator
                </a>
                <p className="hero-note">
                  No odds feeds, no affiliates. Just math.
                </p>
              </div>

              <div className="hero-badges">
                <span className="hero-badge">Simple payout view</span>
                <span className="hero-badge">Two-sided vig</span>
                <span className="hero-badge">Fair odds (no-vig)</span>
                <span className="hero-badge">EV from both sides</span>
              </div>
            </div>
          </section>

          {/* CALCULATOR */}
          <section className="calculator-section" id="calculator">
            <header className="app-header">
              <h2 className="app-title">Parlay &amp; Vig Calculator</h2>
              <p className="app-subtitle">
                Use it as a quick slip checker, or turn on sharp mode to see how much
                the book is taxing your bet.
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
                  <button
                    type="button"
                    className="btn btn-inline-link"
                    onClick={loadExampleParlay}
                  >
                    Try an example parlay
                  </button>
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

                      const oppOddsNum = Number(leg.opponentOdds);

                      // Use helper to get vig / fair + edge when both sides valid
                      const market =
                        isValid && leg.opponentOdds.trim() !== ""
                          ? analyzeTwoSidedMarket(oddsNum, oppOddsNum)
                          : null;

                      return (
                        <div key={leg.id} className="leg-card">
                          <div className="leg-main">
                            <div className="leg-label-row">
                              <span className="leg-label">
                                Leg {index + 1}
                              </span>
                            </div>

                            <label className="field-label">
                              Leg label (optional)
                            </label>
                            <input
                              type="text"
                              value={leg.label}
                              onChange={(e) =>
                                updateLeg(leg.id, "label", e.target.value)
                              }
                              placeholder="e.g. Ravens ML, Over 45.5"
                              className="input"
                            />

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

                            {/* Implied odds = secondary detail now */}
                            {isValid && prob !== null && decimal !== null && (
                              <p className="field-helper">
                                Implied:{" "}
                                <strong>
                                  {(prob * 100).toFixed(1)}%
                                </strong>{" "}
                                · Decimal:{" "}
                                <strong>{decimal.toFixed(2)}</strong>
                              </p>
                            )}

                            <label
                              className="field-label"
                              style={{ marginTop: 8 }}
                            >
                              Opponent odds (other side)
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

                            {market && (
                              <p className="field-helper">
                                Vig on this market:{" "}
                                <strong>
                                  {(market.hold * 100).toFixed(1)}%
                                </strong>{" "}
                                · Edge vs fair on your side:{" "}
                                <strong
                                  className={valueSignClass(
                                    market.houseEdgePct
                                  )}
                                >
                                  {market.houseEdgePct >= 0 ? "+" : "-"}
                                  {Math.abs(
                                    market.houseEdgePct
                                  ).toFixed(1)}
                                  %
                                </strong>
                              </p>
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
                      Fill out valid American odds for all legs to see
                      combined parlay results.
                    </p>
                  )}
                </div>
              </section>

              {/* RIGHT COLUMN – summary + sharp mode */}
              <section className="card">
                {/* Basic parlay summary (standard calculator mode) */}
                <div className="card-section card-section--with-header">
                  <h3 className="card-title">Parlay summary</h3>
                </div>

                <div className="card-section">
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
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "#6de0b0",
                          }}
                        >
                          Copy or share this parlay
                        </span>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
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
                            {copied ? "Copied" : "Copy basic"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              if (!shareText) return;
                              navigator.clipboard
                                .writeText(shareText)
                                .then(() => {
                                  setShareCopied(true);
                                  setTimeout(
                                    () => setShareCopied(false),
                                    1500
                                  );
                                })
                                .catch(() => {
                                  // ignore
                                });
                            }}
                          >
                            {shareCopied ? "Copied" : "Copy for Reddit/Discord"}
                          </button>
                        </div>
                      </div>

                      <div className="summary-grid">
                        <div className="summary-item">
                          <span className="summary-label">
                            Implied chance of parlay
                          </span>
                          <span className="summary-value">
                            {(parlayMetrics.parlayImpliedProb * 100).toFixed(1)}%
                            <span className="summary-sub">
                              {" "}
                              (about 1 in{" "}
                              {(1 / parlayMetrics.parlayImpliedProb).toFixed(1)})
                            </span>
                          </span>
                        </div>

                        <div className="summary-item">
                          <span className="summary-label">
                            Payout (return)
                          </span>
                          <span className="summary-value">
                            ${parlayMetrics.potentialReturn.toFixed(2)}
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
                            Combined decimal odds
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

                {/* Sharp mode: vig + fair odds + EV, behind a toggle */}
                <div className="card-section card-section--with-header">
                  <h3 className="card-title">Sharp mode</h3>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      setShowAdvancedExplainer(false);
                      setShowAdvanced((v) => !v);
                    }}
                  >
                    {showAdvanced ? "Turn off" : "Turn on"}
                  </button>
                </div>

                <div className="card-section">
                  {!showAdvanced && (
                    <p className="field-helper">
                      Turn this on to see the vig (overround), fair no-vig price,
                      and long-run EV of your parlay based on both sides of each leg.
                    </p>
                  )}

                  {showAdvanced && !fairParlayMetrics && (
                    <p className="field-helper">
                      Enter opponent odds for every leg to unlock fair odds, vig,
                      and EV. We use both sides of each market instead of just
                      trusting one number from the book.
                    </p>
                  )}

                  {showAdvanced && fairParlayMetrics && (
                    <>
                      {/* VIG + FAIR ODDS FIRST (the interesting part) */}
                      <div className="summary-grid" style={{ marginBottom: 8 }}>
                        {fairParlayMetrics.avgLegHold != null && (
                          <div className="summary-item">
                            <span className="summary-label">
                              Avg market hold per leg (vig)
                            </span>
                            <span className="summary-value">
                              {(fairParlayMetrics.avgLegHold * 100).toFixed(1)}%
                            </span>
                          </div>
                        )}

                        <div className="summary-item">
                          <span className="summary-label">
                            Fair parlay odds (no-vig)
                          </span>
                          <span className="summary-value">
                            {fairParlayMetrics.fairDecimal.toFixed(2)}
                          </span>
                        </div>

                        {fairParlayMetrics.edgePct != null && (
                          <div className="summary-item">
                            <span className="summary-label">
                              Estimated book edge on this parlay
                            </span>
                            <span
                              className={
                                "summary-value " +
                                valueSignClass(fairParlayMetrics.edgePct)
                              }
                            >
                              {(fairParlayMetrics.edgePct * 100).toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </div>

                      {/* EV SECOND: “Is this bet good or bad long term?” */}
                      {evMetrics && (
                        <>
                          <div
                            className="summary-grid"
                            style={{ marginBottom: 4 }}
                          >
                            <div className="summary-item">
                              <span className="summary-label">
                                EV per bet (expected profit)
                              </span>
                              <span
                                className={
                                  "summary-value " +
                                  valueSignClass(evMetrics.evPerBet)
                                }
                              >
                                {evMetrics.evPerBet >= 0 ? "+" : "-"}$
                                {Math.abs(evMetrics.evPerBet).toFixed(2)}
                              </span>
                            </div>
                            <div className="summary-item">
                              <span className="summary-label">
                                EV per $100 staked
                              </span>
                              <span
                                className={
                                  "summary-value " +
                                  valueSignClass(evMetrics.evPct)
                                }
                              >
                                {evMetrics.evPct >= 0 ? "+" : "-"}$
                                {Math.abs(evMetrics.evPct).toFixed(1)}
                              </span>
                            </div>
                          </div>
                          <p className="field-helper">
                            Green numbers favor you; red numbers favor the book.
                            EV is the long-run average if you placed this exact
                            bet over and over (assuming the inputs are accurate).
                          </p>
                        </>
                      )}

                      {/* Collapsible “what does this mean?” explainer */}
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() =>
                          setShowAdvancedExplainer((v) => !v)
                        }
                        style={{ marginBottom: showAdvancedExplainer ? 8 : 0 }}
                      >
                        {showAdvancedExplainer
                          ? "Hide explanation"
                          : "What do these numbers mean?"}
                      </button>

                      {showAdvancedExplainer && (
                        <div className="field-helper" style={{ marginTop: 6 }}>
                          <p style={{ marginBottom: 4 }}>
                            <strong>Vig / hold</strong> is the built-in tax on a
                            market. If both sides add up to 105%, the extra 5% is
                            the book&apos;s cut.
                          </p>
                          <p style={{ marginBottom: 4 }}>
                            <strong>Fair odds (no-vig)</strong> are what the odds
                            would look like if you stripped that tax out and only
                            priced the actual chances.
                          </p>
                          <p style={{ marginBottom: 4 }}>
                            <strong>Book edge</strong> compares your real payout
                            to that fair world. A positive edge means the book is
                            keeping that much on average.
                          </p>
                          <p>
                            <strong>EV</strong> is your long-run result if you
                            placed this same bet thousands of times. Positive EV
                            means you&apos;d expect to win over the long haul;
                            negative EV means the opposite.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>
            </div>
          </section>

          {/* INFO / HOW IT WORKS */}
          <section className="info-section" id="how-it-works">
            <h2 className="info-title">How it works</h2>
            <div className="info-grid">
              <div className="info-block">
                <h3>Slip mode</h3>
                <p>
                  Enter a stake and legs to see implied chance, total payout, and
                  profit. It works like a normal parlay calculator so you don&apos;t
                  have to bounce between apps.
                </p>
              </div>
              <div className="info-block">
                <h3>Sharp mode</h3>
                <p>
                  Add both sides of each market and we calculate the vig, strip it
                  out to find fair odds, and estimate the book&apos;s edge and your
                  expected value.
                </p>
              </div>
              <div className="info-block">
                <h3>Why both sides?</h3>
                <p>
                  Sportsbooks can shade one side. Using both prices gives a cleaner
                  picture of what the market really thinks and how much tax is
                  baked in.
                </p>
              </div>
            </div>

            <p className="info-disclaimer">
              This is information, not betting advice. Know your limits and your
              local laws.
            </p>
          </section>
        </main>

        <footer className="site-footer">
          <span>Two-Sided Vig Calculator</span>
          <span>Understand the numbers behind the slip.</span>
        </footer>
      </div>
    </div>
  );
}
