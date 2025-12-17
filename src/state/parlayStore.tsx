//parlayStore.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Leg } from "../lib/parlayMath";

const STORAGE_KEY = "twoSidedVigCalculatorState";

type ParlayState = {
  stake: string;
  bookTotalOdds: string; // sportsbook offered total odds (American)
  legs: Leg[];
  previewRemovedIds: Set<number>;

  setStake: (v: string) => void;
  setBookTotalOdds: (v: string) => void;

  addLeg: () => void;
  removeLeg: (id: number) => void;
  updateLeg: (id: number, field: keyof Leg, value: string | boolean) => void;

  togglePreviewRemove: (id: number) => void;
  clearPreview: () => void;
  applyPreviewRemovals: () => void;
};

const Ctx = createContext<ParlayState | null>(null);

function nextId(legs: Leg[]) {
  return legs.length ? Math.max(...legs.map((l) => l.id)) + 1 : 1;
}

const DEFAULT_LEGS: Leg[] = [
  { id: 1, label: "", americanOdds: "-110", useOpponent: false, opponentOdds: "" },
  { id: 2, label: "", americanOdds: "-110", useOpponent: false, opponentOdds: "" },
];

export function ParlayProvider({ children }: { children: React.ReactNode }) {
  const [stake, setStake] = useState("10");
  const [bookTotalOdds, setBookTotalOdds] = useState(""); // optional; user enters when they have it
  const [legs, setLegs] = useState<Leg[]>(DEFAULT_LEGS);
  const [previewRemovedIds, setPreviewRemovedIds] = useState<Set<number>>(new Set());

  // load
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { stake?: string; bookTotalOdds?: string; legs?: any[] };

      if (parsed.stake && Number(parsed.stake) > 0) setStake(parsed.stake);

      if (typeof parsed.bookTotalOdds === "string") {
        setBookTotalOdds(parsed.bookTotalOdds);
      }

      if (Array.isArray(parsed.legs) && parsed.legs.length > 0) {
        const cleaned: Leg[] = parsed.legs
          .map((l, idx) => ({
            id: typeof l.id === "number" ? l.id : idx + 1,
            label: typeof l.label === "string" ? l.label : "",
            americanOdds: typeof l.americanOdds === "string" ? l.americanOdds : "",
            useOpponent: typeof l.useOpponent === "boolean" ? l.useOpponent : false,
            opponentOdds: typeof l.opponentOdds === "string" ? l.opponentOdds : "",
          }))
          .filter((l) => l.americanOdds.trim() !== "");

        if (cleaned.length > 0) setLegs(cleaned);
      }
    } catch {
      // ignore
    }
  }, []);

  // persist
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ stake, bookTotalOdds, legs }));
    } catch {
      // ignore
    }
  }, [stake, bookTotalOdds, legs]);

  const addLeg = () => {
    setLegs((prev) => [
      ...prev,
      { id: nextId(prev), label: "", americanOdds: "-110", useOpponent: false, opponentOdds: "" },
    ]);
  };

  const removeLeg = (id: number) => {
    setLegs((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));
    setPreviewRemovedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const updateLeg = (id: number, field: keyof Leg, value: string | boolean) => {
    setLegs((prev) =>
      prev.map((leg) => {
        if (leg.id !== id) return leg;

        if (field === "useOpponent" && value === false) {
          return { ...leg, useOpponent: false, opponentOdds: "" };
        }
        return { ...leg, [field]: value } as Leg;
      })
    );
  };

  const togglePreviewRemove = (id: number) => {
    setPreviewRemovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearPreview = () => setPreviewRemovedIds(new Set());

  const applyPreviewRemovals = () => {
    if (previewRemovedIds.size === 0) return;
    setLegs((prev) => prev.filter((l) => !previewRemovedIds.has(l.id)));
    clearPreview();
  };

  const value = useMemo<ParlayState>(
    () => ({
      stake,
      bookTotalOdds,
      legs,
      previewRemovedIds,
      setStake,
      setBookTotalOdds,
      addLeg,
      removeLeg,
      updateLeg,
      togglePreviewRemove,
      clearPreview,
      applyPreviewRemovals,
    }),
    [stake, bookTotalOdds, legs, previewRemovedIds]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useParlay() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useParlay must be used inside ParlayProvider");
  return ctx;
}
