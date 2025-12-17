//ScaleKey.tsx
export default function ScaleKey({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`pricing-scale-key ${compact ? "pricing-scale-key--compact" : ""}`}>
      <div className="pricing-scale-key-title">How to read this</div>

      <ul>
        <li>
          <strong>0%</strong> — No correlation
          <span> Legs have the highest possible payout advantage</span>
        </li>
        <li>
          <strong>100%</strong> — Fully correlated
          <span>Legs have no payout advantage</span>
        </li>
      </ul>
    </div>
  );
}
