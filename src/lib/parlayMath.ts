//parlayMath.ts
import { americanToDecimal, americanToImpliedProb } from "../utils/odds";

export type Leg = {
  id: number;
  label: string;
  americanOdds: string;
  useOpponent: boolean;
  opponentOdds: string;
};

export type ParsedLeg = Leg & {
  oddsNum: number;
  decimal: number | null;
  impliedProb: number | null;
  isValid: boolean;
};

export type ParlayMetrics = {
  combinedDecimal: number;
  parlayImpliedProb: number; // book-implied from entered odds
  potentialReturn: number;
  profit: number;
};

export function parseStake(stake: string): number | null {
  const n = Number(stake);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseLegs(legs: Leg[]): {
  parsedLegs: ParsedLeg[];
  validLegs: ParsedLeg[];
  allValid: boolean;
} {
  const parsedLegs: ParsedLeg[] = legs.map((leg) => {
    const oddsNum = Number(leg.americanOdds);
    const decimal = americanToDecimal(oddsNum);
    const impliedProb = americanToImpliedProb(oddsNum);

    const isValid =
      leg.americanOdds.trim() !== "" &&
      Number.isFinite(oddsNum) &&
      oddsNum !== 0 &&
      decimal != null &&
      impliedProb != null;

    return { ...leg, oddsNum, decimal, impliedProb, isValid };
  });

  const validLegs = parsedLegs.filter((l) => l.isValid);
  const allValid = validLegs.length === legs.length && validLegs.length > 0;

  return { parsedLegs, validLegs, allValid };
}

export function computeParlayMetrics(stake: number, validLegs: ParsedLeg[]): ParlayMetrics | null {
  if (!validLegs.length) return null;

  const combinedDecimal = validLegs.reduce((acc, leg) => acc * (leg.decimal ?? 1), 1);
  if (!Number.isFinite(combinedDecimal) || combinedDecimal <= 1) return null;

  const parlayImpliedProb = 1 / combinedDecimal;
  const potentialReturn = stake * combinedDecimal;
  const profit = potentialReturn - stake;

  return { combinedDecimal, parlayImpliedProb, potentialReturn, profit };
}

// Convert decimal odds -> American odds (rounded integer)
export function decimalToAmerican(decimal: number): number | null {
  if (!Number.isFinite(decimal) || decimal <= 1) return null;

  // If decimal >= 2, American is positive
  if (decimal >= 2) {
    const a = (decimal - 1) * 100;
    return Math.round(a);
  }

  // If decimal < 2, American is negative
  const a = -100 / (decimal - 1);
  return Math.round(a);
}

export function formatAmerican(american: number | null): string {
  if (american == null || !Number.isFinite(american) || american === 0) return "—";
  return american > 0 ? `+${american}` : `${american}`;
}

/**
 * Pricing scale: compare the sportsbook's offered TOTAL odds vs straight multiplication.
 *
 * adjustmentPct = (bookTotalDecimal / independentDecimal - 1) * 100
 *
 * Show rule:
 * - 2+ valid legs
 * - AND bookTotalDecimal is valid
 */
export type PricingScaleResult = {
  independentDecimal: number;
  bookTotalDecimal: number;
  adjustmentPct: number;
};

export function computePricingScaleFromBookTotal(
  validLegs: ParsedLeg[],
  bookTotalDecimal: number
): PricingScaleResult | null {
  if (validLegs.length < 2) return null;
  if (!Number.isFinite(bookTotalDecimal) || bookTotalDecimal <= 1) return null;

  const independentDecimal = validLegs.reduce((acc, l) => acc * (l.decimal ?? 1), 1);
  if (!Number.isFinite(independentDecimal) || independentDecimal <= 1) return null;

  const adjustmentPct = (bookTotalDecimal / independentDecimal - 1) * 100;

  return { independentDecimal, bookTotalDecimal, adjustmentPct };
}
