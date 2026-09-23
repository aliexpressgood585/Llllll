import type { ReactNode } from 'react';

export function Panel({ title, right, children, className = '', bodyClass = '' }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`panel-glow flex flex-col rounded-[3px] border border-line bg-panel ${className}`}>
      <header className="flex items-center justify-between gap-2 border-b border-line px-2.5 py-1.5">
        <h2 className="truncate text-[11px] font-semibold tracking-[0.04em] text-text">{title}</h2>
        {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
      </header>
      <div className={`min-h-0 flex-1 p-2.5 ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function Tile({ label, value, sub, tone = 'text-text', className = '' }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: string; className?: string }) {
  return (
    <div className={`rounded-[3px] border border-line bg-panel2 px-2.5 py-2 ${className}`}>
      <div className="truncate text-[9.5px] font-medium uppercase tracking-wider text-muted">{label}</div>
      <div className={`num mt-0.5 text-[17px] font-semibold leading-tight ${tone}`}>{value}</div>
      {sub && <div className="num mt-0.5 truncate text-[10px] text-dim">{sub}</div>}
    </div>
  );
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[3px] border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
        active ? 'border-accent/60 bg-accent/15 text-accent' : 'border-line2 text-muted hover:border-dim hover:text-dim'
      }`}
    >
      {children}
    </button>
  );
}

export function Row({ label, value, tone = 'text-text' }: { label: ReactNode; value: ReactNode; tone?: string }) {
  return (
    <div className="flex items-center justify-between py-[3px] text-[11px]">
      <span className="text-dim">{label}</span>
      <span className={`num font-medium ${tone}`}>{value}</span>
    </div>
  );
}

export function Dot({ tone = 'bg-up', pulse = false }: { tone?: string; pulse?: boolean }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${tone} ${pulse ? 'pulse-dot' : ''}`} />;
}

export function Bar({ value, max = 1, tone = 'bg-accent', className = '' }: { value: number; max?: number; tone?: string; className?: string }) {
  const w = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-sm bg-line ${className}`}>
      <div className={`h-full ${tone}`} style={{ width: `${w}%` }} />
    </div>
  );
}

export const sevLabel: Record<string, string> = { LOW: 'נמוכה', MEDIUM: 'בינונית', HIGH: 'גבוהה', CRITICAL: 'קריטית' };

export const sevTone: Record<string, string> = {
  LOW: 'text-up',
  MEDIUM: 'text-warn',
  HIGH: 'text-down',
  CRITICAL: 'text-white bg-down/80 px-1 rounded-sm',
};
