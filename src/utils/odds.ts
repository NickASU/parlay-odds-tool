// src/utils/odds.ts

// Convert American odds -> decimal odds
export function americanToDecimal(odds: number): number | null {
  if (!Number.isFinite(odds) || odds === 0) return null;
  if (odds > 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

// Convert American odds -> implied probability (with vig if from book)
export function americanToImpliedProb(odds: number): number | null {
  if (!Number.isFinite(odds) || odds === 0) return null;
  if (odds > 0) {
    return 100 / (odds + 100);
  }
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

export type MarketVigResult = {
  pYou: number;          // implied probability of your side (with vig)
  pOpp: number;          // implied probability of opponent
  overround: number;     // pYou + pOpp
  hold: number;          // overround - 1  (market hold / vig)
  pNoVigYou: number;     // fair (no-vig) probability of your side
  fairDecimal: number;   // decimal odds from pNoVigYou
  houseEdgePct: number;  // positive => house edge; negative => bettor edge
};

/**
 * Analyze a two-sided market from American odds on both sides.
 * Returns null if anything is invalid.
 */
export function analyzeTwoSidedMarket(
  yourOdds: number,
  oppOdds: number
): MarketVigResult | null {
  const bookDecimal = americanToDecimal(yourOdds);
  const pYou = americanToImpliedProb(yourOdds);
  const pOpp = americanToImpliedProb(oppOdds);

  if (bookDecimal == null || pYou == null || pOpp == null) return null;

  const overround = pYou + pOpp;
  if (!Number.isFinite(overround) || overround <= 0) return null;

  const hold = overround - 1;
  const pNoVigYou = pYou / overround;
  if (!Number.isFinite(pNoVigYou) || pNoVigYou <= 0 || pNoVigYou >= 1) {
    return null;
  }

  const fairDecimal = 1 / pNoVigYou;
  if (!Number.isFinite(fairDecimal) || fairDecimal <= 1) return null;

  const houseEdgePct = 1 - bookDecimal / fairDecimal;

  return {
    pYou,
    pOpp,
    overround,
    hold,
    pNoVigYou,
    fairDecimal,
    houseEdgePct,
  };
}
