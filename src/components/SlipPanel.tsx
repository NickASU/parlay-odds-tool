//SlipPanel.tsx
import { useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";

import { useParlay } from "../state/parlayStore";
import { computeParlayMetrics, parseLegs, parseStake } from "../lib/parlayMath";
import ShareCard from "./ShareCard";

export default function SlipPanel() {
  const { stake, legs, previewRemovedIds } = useParlay();
  const [copied, setCopied] = useState(false);
  const shareCardRef = useRef<HTMLDivElement | null>(null);

  const parsedStake = useMemo(() => parseStake(stake), [stake]);

  const liveLegs = useMemo(() => {
    if (previewRemovedIds.size === 0) return legs;
    return legs.filter((l) => !previewRemovedIds.has(l.id));
  }, [legs, previewRemovedIds]);

  const { validLegs } = useMemo(() => parseLegs(liveLegs), [liveLegs]);
  const parlay = useMemo(
    () => (parsedStake ? computeParlayMetrics(parsedStake, validLegs) : null),
    [parsedStake, validLegs]
  );

  const summaryText = useMemo(() => {
    if (!parlay || !parsedStake) return "";
    const legsStr = legs
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
      `Implied ${(parlay.parlayImpliedProb * 100).toFixed(1)}%`,
      `Return $${parlay.potentialReturn.toFixed(2)}`,
      `Profit $${parlay.profit.toFixed(2)}`,
      legsStr && `Legs ${legsStr}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }, [parlay, parsedStake, legs]);

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

  return (
    <div className="card-section">
      {!validLegs.length && <p className="field-helper">Add at least one valid leg to calculate the parlay.</p>}

      {parlay && parsedStake && (
        <>
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
            <span style={{ fontSize: "0.75rem", color: "#6de0b0" }}>
              {previewRemovedIds.size > 0 ? "Previewing removals" : "Download or copy this parlay"}
            </span>

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

          <div className="summary-grid">
            <div className="summary-item">
              <span className="summary-label">Implied chance</span>
              <span className="summary-value">
                {(parlay.parlayImpliedProb * 100).toFixed(1)}%
                <span className="summary-sub"> (about 1 in {(1 / parlay.parlayImpliedProb).toFixed(1)})</span>
              </span>
            </div>

            <div className="summary-item">
              <span className="summary-label">Payout (return)</span>
              <span className="summary-value">${parlay.potentialReturn.toFixed(2)}</span>
            </div>

            <div className="summary-item">
              <span className="summary-label">Profit (winnings)</span>
              <span className="summary-value">${parlay.profit.toFixed(2)}</span>
            </div>

            <div className="summary-item">
              <span className="summary-label">Combined decimal</span>
              <span className="summary-value">{parlay.combinedDecimal.toFixed(2)}</span>
            </div>
          </div>

          <ShareCard shareCardRef={shareCardRef} legs={liveLegs} stake={parsedStake} parlay={parlay} />
        </>
      )}
    </div>
  );
}
