import type { DeskSnapshot } from '../engine/engine';
import { fmtUsd } from '../lib/format';

export function BlowupBanner({ s }: { s: DeskSnapshot }) {
  if (!s.blowup.active) return null;
  const last = s.attemptsLog[0];
  return (
    <div className="pulse-dot fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-4 border-b border-down bg-down/90 px-4 py-2 text-[12px] font-semibold uppercase tracking-wider text-white shadow-2xl">
      <span>⚠ חשבון #{last?.attempt} חוסל</span>
      <span className="num">שיא {fmtUsd(last?.peak ?? 0)} ← נמחק תוך {(last?.hours ?? 0).toFixed(1)} שעות</span>
      <span className="num">הסימולציה נעצרה — איפוס ידני בכותרת</span>
    </div>
  );
}

