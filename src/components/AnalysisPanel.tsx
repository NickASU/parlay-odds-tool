// AnalysisPanel.tsx
import { useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";

import { useParlay } from "../state/parlayStore";
import {
  computeParlayMetrics,
  computePricingScaleFromBookTotal,
  decimalToAmerican,
  formatAmerican,
  parseLegs,
  parseStake,
} from "../lib/parlayMath";
import { americanToDecimal } from "../utils/odds";

import ShareCard from "./ShareCard";
import PricingScale from "./PricingScale";
import ScaleKey from "./ScaleKey";

function safeAmericanInputDisplay(raw: string): string {
  const s = raw.trim();
  if (!s) return "—";
  const n = Number(s);
  if (!Number.isFinite(n) || n === 0) return "—";
  return formatAmerican(Math.round(n));
}

export default function AnalysisPanel() {
  const { stake, bookTotalOdds, legs, previewRemovedIds, togglePreviewRemove, clearPreview } = useParlay();

  const [copied, setCopied] = useState(false);
  const [includeScaleOnSlip, setIncludeScaleOnSlip] = useState(false);
  const [includeKeyOnSlip, setIncludeKeyOnSlip] = useState(false);

  const shareCardRef = useRef<HTMLDivElement | null>(null);

  const parsedStake = useMemo(() => parseStake(stake), [stake]);
  if (!parsedStake) {
    return (
      <div className="card-section">
        <p className="field-helper">Enter a positive stake to see outcomes.</p>
      </div>
    );
  }

  // Parse ALL legs (so list includes excluded + invalid)
  const { parsedLegs: allParsedLegs, validLegs: allValidLegs } = useMemo(() => parseLegs(legs), [legs]);

  // CURRENT VIEW legs (excluded removed live)
  const previewLegs = useMemo(() => {
    if (previewRemovedIds.size === 0) return legs;
    return legs.filter((l) => !previewRemovedIds.has(l.id));
  }, [legs, previewRemovedIds]);

  const { validLegs: previewValidLegs } = useMemo(() => parseLegs(previewLegs), [previewLegs]);

  // “Best odds” = your independent/multiplied baseline
  const baselineParlay = useMemo(
    () => computeParlayMetrics(parsedStake, previewValidLegs),
    [parsedStake, previewValidLegs]
  );

  const bestOddsAmerican = useMemo(() => {
    if (!baselineParlay) return "—";
    return formatAmerican(decimalToAmerican(baselineParlay.combinedDecimal));
  }, [baselineParlay]);

  const isPreviewing = previewRemovedIds.size > 0;

  // Book total odds -> decimal (optional)
  const bookTotalDecimal = useMemo(() => {
    if (!bookTotalOdds.trim()) return null;
    const n = Number(bookTotalOdds);
    const dec = americanToDecimal(n);
    if (!Number.isFinite(n) || n === 0 || dec == null || dec <= 1) return null;
    return dec;
  }, [bookTotalOdds]);

  // Correlation pricing scale: needs 2+ legs + book total decimal
  const pricingScale = useMemo(() => {
    if (bookTotalDecimal == null) return null;
    return computePricingScaleFromBookTotal(previewValidLegs, bookTotalDecimal);
  }, [previewValidLegs, bookTotalDecimal]);

  const effectiveIncludeScaleOnSlip = includeScaleOnSlip && !!pricingScale;
  const effectiveIncludeKeyOnSlip = includeKeyOnSlip && effectiveIncludeScaleOnSlip;

  const bookOddsAmerican = useMemo(() => safeAmericanInputDisplay(bookTotalOdds), [bookTotalOdds]);

  // Return/profit should reflect what you actually get paid:
  // - If book total exists => use book odds payout
  // - Else => use best odds payout
  const payout = useMemo(() => {
    if (!baselineParlay) return null;

    const decimal = bookTotalDecimal ?? baselineParlay.combinedDecimal;
    if (!Number.isFinite(decimal) || decimal <= 1) return null;

    const potentialReturn = parsedStake * decimal;
    const profit = potentialReturn - parsedStake;

    return { potentialReturn, profit, decimalUsed: decimal };
  }, [baselineParlay, bookTotalDecimal, parsedStake]);

  const correlationLabel = useMemo(() => {
    if (!pricingScale) return null;
    const v = pricingScale.adjustmentPct;
    const rounded = Math.round(v);
    // simple + slightly provocative
    if (rounded < 0) return `${rounded}% correlation pricing (better)`;
    return `+${rounded}% correlation pricing`;
  }, [pricingScale]);

  // Sort legs by implied win probability (lowest first) — keep your existing behavior
  const sortedLegRows = useMemo(() => {
    const valids = allParsedLegs
      .filter((l) => l.isValid && l.impliedProb != null)
      .map((l, idx) => ({
        id: l.id,
        index: idx + 1,
        label: (l.label || "").trim() ? (l.label || "").trim() : `Leg ${idx + 1}`,
        americanOdds: l.americanOdds,
        impliedProb: l.impliedProb!,
      }))
      .sort((a, b) => a.impliedProb - b.impliedProb);

    const invalids = allParsedLegs
      .filter((l) => !l.isValid)
      .map((l, idx) => ({
        id: l.id,
        index: idx + 1,
        label: (l.label || "").trim() ? (l.label || "").trim() : `Leg ${idx + 1}`,
        americanOdds: l.americanOdds,
        impliedProb: null as number | null,
      }));

    return [...valids, ...invalids];
  }, [allParsedLegs]);

  const summaryText = useMemo(() => {
    if (!baselineParlay || !payout) return "";

    const legsStr = previewLegs
      .map((leg, i) => {
        const base = leg.label.trim() ? `Leg ${i + 1}: ${leg.label.trim()}` : `Leg ${i + 1}`;
        const odds =
          leg.useOpponent && leg.opponentOdds.trim()
            ? `${leg.americanOdds} vs ${leg.opponentOdds}`
            : `${leg.americanOdds}`;
        return `${base} (${odds})`;
      })
      .join(" | ");

    return [
      `Parlay`,
      `Stake $${parsedStake.toFixed(2)}`,
      bookTotalDecimal != null ? `Book odds ${bookOddsAmerican}` : `Best odds ${bestOddsAmerican}`,
      `Best odds ${bestOddsAmerican}`,
      pricingScale ? `Correlation ${Math.round(pricingScale.adjustmentPct)}%` : null,
      `Return $${payout.potentialReturn.toFixed(2)}`,
      `Profit $${payout.profit.toFixed(2)}`,
      legsStr && `Legs ${legsStr}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }, [
    baselineParlay,
    payout,
    parsedStake,
    previewLegs,
    bookTotalDecimal,
    bookOddsAmerican,
    bestOddsAmerican,
    pricingScale,
  ]);

  async function handleDownloadSlip() {
    if (!shareCardRef.current) return;

    try {
      const canvas = await html2canvas(shareCardRef.current, {
        backgroundColor: "#000000",
        scale: window.devicePixelRatio || 2,
      });
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "parlay-slip.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to download slip", err);
    }
  }

  if (allValidLegs.length === 0) {
    return (
      <div className="card-section">
        <p className="field-helper">Add at least one valid leg to see outcomes.</p>
      </div>
    );
  }

  return (
    <div className="card-section">
      {/* Parlay outcome */}
      {baselineParlay && payout ? (
        <>
          <div className="summary-grid" style={{ marginBottom: 10 }}>
            {bookTotalDecimal != null ? (
              <>
                <div className="summary-item">
                  <span className="summary-label">
                    Book offered odds{isPreviewing ? ` (excluded ${previewRemovedIds.size})` : ""}
                  </span>
                  <span className="summary-value">{bookOddsAmerican}</span>
                </div>

                <div className="summary-item">
                  <span className="summary-label">Best odds (independent)</span>
                  <span className="summary-value">{bestOddsAmerican}</span>
                </div>

                {correlationLabel && (
                  <div className="summary-item">
                    <span className="summary-label">Correlation pricing</span>
                    <span className="summary-value">{correlationLabel}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="summary-item">
                <span className="summary-label">
                  Best odds{isPreviewing ? ` (excluded ${previewRemovedIds.size})` : ""}
                </span>
                <span className="summary-value">{bestOddsAmerican}</span>
              </div>
            )}

            <div className="summary-item">
              <span className="summary-label">Return (includes stake)</span>
              <span className="summary-value">${payout.potentialReturn.toFixed(2)}</span>
            </div>

            <div className="summary-item">
              <span className="summary-label">Profit</span>
              <span className="summary-value">${payout.profit.toFixed(2)}</span>
            </div>
          </div>

          {/* Keep correlation pricing visual + key when available */}
          {pricingScale ? (
            <div style={{ marginTop: 8, marginBottom: 10 }}>
              <PricingScale adjustmentPct={pricingScale.adjustmentPct} showExplanation={false} />
              <ScaleKey />
            </div>
          ) : (
            <p className="field-helper" style={{ marginTop: 8, marginBottom: 10, opacity: 0.9 }}>
              Add <strong>Book offered total odds</strong> (and use 2+ valid legs) to see correlation pricing.
            </p>
          )}
        </>
      ) : (
        <p className="field-helper" style={{ marginBottom: 10 }}>
          Remaining legs need valid odds to compute the parlay.
        </p>
      )}

      {/* Legs list */}
      <p className="field-helper" style={{ marginTop: 6, marginBottom: 6 }}>
        <strong>Legs (sorted by implied win probability)</strong>{" "}
        <span style={{ opacity: 0.85 }}>(uncheck to exclude; outcome updates instantly)</span>
      </p>

      <div className="summary-grid" style={{ marginTop: 0 }}>
        {sortedLegRows.map((r) => {
          const included = !previewRemovedIds.has(r.id);
          const pct = r.impliedProb != null ? (r.impliedProb * 100).toFixed(1) : null;

          return (
            <div key={r.id} className="summary-item">
              <span className="summary-label" style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={included}
                  onChange={() => togglePreviewRemove(r.id)}
                  aria-label={`${included ? "Exclude" : "Include"} leg ${r.index}`}
                />
                <span>
                  {r.index}. {r.label} <span style={{ color: "#57c79c" }}>({r.americanOdds || "—"})</span>
                </span>
              </span>

              <span className="summary-value" style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                {pct != null ? `${pct}% implied` : "—"}
              </span>
            </div>
          );
        })}
      </div>

      {previewRemovedIds.size > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={clearPreview}>
            Reset (include all)
          </button>
        </div>
      )}

      {/* Share slip */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>Share slip</div>
            <div className="field-helper" style={{ marginTop: 2 }}>
              Exports the current included legs + outcome.
            </div>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={effectiveIncludeScaleOnSlip}
                  disabled={!pricingScale}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setIncludeScaleOnSlip(next);
                    if (!next) setIncludeKeyOnSlip(false);
                  }}
                />
                <span style={{ fontSize: "0.75rem", color: pricingScale ? "#6de0b0" : "#4fa07c", opacity: pricingScale ? 1 : 0.7 }}>
                  Include scale on slip
                </span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={effectiveIncludeKeyOnSlip}
                  disabled={!pricingScale || !effectiveIncludeScaleOnSlip}
                  onChange={(e) => setIncludeKeyOnSlip(e.target.checked)}
                />
                <span style={{ fontSize: "0.75rem", color: effectiveIncludeScaleOnSlip ? "#6de0b0" : "#4fa07c", opacity: effectiveIncludeScaleOnSlip ? 1 : 0.7 }}>
                  Include key on slip
                </span>
              </label>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={handleDownloadSlip}>
              Download slip
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                if (!summaryText) return;
                navigator.clipboard
                  .writeText(summaryText)
                  .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  })
                  .catch(() => {});
              }}
            >
              {copied ? "Copied" : "Copy text"}
            </button>
          </div>
        </div>

        <ShareCard
          shareCardRef={shareCardRef}
          legs={previewLegs}
          stake={parsedStake}
          parlay={baselineParlay}
          bookTotalOddsAmerican={bookTotalDecimal != null ? bookOddsAmerican : null}
          bookTotalDecimal={bookTotalDecimal}
          pricingAdjustmentPct={pricingScale?.adjustmentPct ?? null}
          showPricingScaleOnSlip={effectiveIncludeScaleOnSlip}
          showScaleKeyOnSlip={effectiveIncludeKeyOnSlip}
        />
      </div>
    </div>
  );
}
