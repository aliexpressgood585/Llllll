import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { PRIORITY, STATUS } from '../lib/constants';
import type { Priority, ProjectStatus } from '../lib/types';
import { Icon } from './Icon';

/* ---------------- buttons ---------------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
const V: Record<Variant, string> = {
  primary: 'bg-primary text-primary-ink hover:brightness-110 active:brightness-95 shadow-card',
  accent: 'bg-accent text-white hover:brightness-110 active:brightness-95 shadow-card',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2 active:bg-surface-3',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-3',
  danger: 'bg-failed text-white hover:brightness-110 active:brightness-95',
};
export function Button({ variant = 'secondary', size = 'md', icon, children, className = '', loading, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: string; loading?: boolean }) {
  return (
    <button type="button" {...rest} disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-10 px-3.5 text-sm'} ${V[variant]} ${className}`}>
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} /> : null}
      {children}
    </button>
  );
}
export function IconButton({ icon, label, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest} className={`inline-grid h-9 w-9 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-2 hover:text-ink active:bg-surface-3 disabled:opacity-40 ${className}`}>
      <Icon name={icon} />
    </button>
  );
}

/* ---------------- surfaces ---------------- */
export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return <section {...rest} className={`rounded-2xl border border-line bg-surface shadow-card ${className}`}>{children}</section>;
}
export function CardHeader({ title, subtitle, actions, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: string }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-ink-2"><Icon name={icon} size={16} /></span>}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ---------------- badges ---------------- */
const TONE: Record<string, string> = {
  working: 'bg-working-soft text-working', needs: 'bg-needs-soft text-needs', failed: 'bg-failed-soft text-failed', review: 'bg-review-soft text-review',
  done: 'bg-done-soft text-done', idle: 'bg-idle-soft text-idle', neutral: 'bg-surface-2 text-ink-2', accent: 'bg-accent-soft text-accent', primary: 'bg-primary-soft text-primary',
};
export function Badge({ tone = 'neutral', icon, children, className = '' }: { tone?: string; icon?: string; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ${TONE[tone] ?? TONE.neutral} ${className}`}>
      {icon && <Icon name={icon} size={13} strokeWidth={2.2} />}
      {children}
    </span>
  );
}
export function StatusBadge({ status, short }: { status: ProjectStatus; short?: boolean }) {
  const s = STATUS[status];
  return <Badge tone={s.tone} icon={s.icon}>{short ? s.short : s.he}</Badge>;
}
export function PriorityBadge({ p }: { p: Priority }) {
  const tone = p === 'high' ? 'failed' : p === 'medium' ? 'needs' : 'neutral';
  return <Badge tone={tone} icon="flag">{PRIORITY[p].he}</Badge>;
}
export function StatusDot({ status }: { status: ProjectStatus }) {
  const c = { working: 'bg-working', needs: 'bg-needs', failed: 'bg-failed', review: 'bg-review', done: 'bg-done', idle: 'bg-idle' }[STATUS[status].tone];
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${c}`} aria-hidden />;
}

/* ---------------- avatar ---------------- */
const AV = ['#2a78d6', '#eb6834', '#1baf7a', '#c98500', '#d55181', '#4a3aa7', '#e34948', '#008300'];
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const letters = name.replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <span className="inline-grid shrink-0 place-items-center rounded-lg font-semibold text-white" style={{ width: size, height: size, background: AV[h % AV.length], fontSize: size * 0.38 }} aria-hidden>
      {letters || '·'}
    </span>
  );
}

/* ---------------- form fields ---------------- */
export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">{label}</label>
      {children}
      {error ? <p id={`${htmlFor}-err`} role="alert" className="flex items-center gap-1 text-[12.5px] text-failed"><Icon name="alert" size={13} />{error}</p> : hint ? <p className="text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}
const fieldCls = (err?: boolean) => `w-full rounded-lg border bg-surface px-3 text-sm text-ink placeholder:text-muted transition focus:outline-none focus:ring-2 focus:ring-[var(--focus)]/40 ${err ? 'border-failed' : 'border-line hover:border-line-strong focus:border-[var(--focus)]'}`;
export function TextInput({ invalid, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...rest} aria-invalid={invalid || undefined} aria-describedby={invalid && rest.id ? `${rest.id}-err` : rest['aria-describedby']} className={`h-10 ${fieldCls(invalid)} ${className}`} />;
}
export function TextArea({ invalid, className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea {...rest} aria-invalid={invalid || undefined} className={`min-h-[84px] py-2 ${fieldCls(invalid)} ${className}`} />;
}
export function Select({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...rest} className={`h-10 appearance-none ps-3 pe-8 ${fieldCls()} ${className}`}>{children}</select>
      <Icon name="chevronDown" size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
}
export function SearchInput({ value, onChange, placeholder, id }: { value: string; onChange: (v: string) => void; placeholder: string; id?: string }) {
  return (
    <div className="relative min-w-0 flex-1">
      <Icon name="search" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
      <input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className={`h-10 ps-9 pe-3 ${fieldCls()}`} />
    </div>
  );
}

/* ---------------- segmented control ---------------- */
export function Segmented<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-surface-2 p-0.5 scroll-thin">
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition ${value === o.value ? 'bg-surface text-ink shadow-card' : 'text-ink-2 hover:text-ink'}`}>
          {o.label}
          {o.count !== undefined && <span className={`tnum rounded-full px-1.5 text-[11px] ${value === o.value ? 'bg-surface-2' : 'bg-surface-3'}`}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------------- tabs ---------------- */
export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line scroll-thin">
      {tabs.map((t) => (
        <button key={t.id} role="tab" type="button" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`-mb-px inline-flex h-10 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition ${value === t.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
          {t.label}{t.count !== undefined && <span className="tnum rounded-full bg-surface-2 px-1.5 text-[11px] text-ink-2">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------------- skeleton / empty / error ---------------- */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}
export function EmptyState({ icon = 'info', title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center gap-2 px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-muted"><Icon name={icon} size={22} /></span>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {text && <p className="max-w-sm text-[13px] leading-relaxed text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ---------------- overlay primitives: dialog & drawer ---------------- */
function useFocusTrap(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () => [...(el?.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') ?? [])].filter((x) => !x.hasAttribute('disabled'));
    setTimeout(() => (el?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0])?.focus(), 20);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') {
        const f = focusables(); if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); prev?.focus?.(); };
  }, [open, onClose]);
  return ref;
}

export function Dialog({ open, onClose, title, children, footer, width = 520 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useFocusTrap(open, onClose);
  const id = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className="pop-in flex max-h-[90vh] w-full flex-col rounded-2xl border border-line bg-surface shadow-pop" style={{ maxWidth: width }}>
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 id={id} className="text-base font-semibold">{title}</h2>
          <IconButton icon="x" label="סגור" onClick={onClose} />
        </header>
        <div className="min-h-0 overflow-y-auto px-5 py-4 scroll-thin">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, subtitle, children, actions }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  const ref = useFocusTrap(open, onClose);
  const id = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 bg-black/30 fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className="slide-in absolute inset-y-0 left-0 flex w-full max-w-[520px] flex-col border-r border-line bg-surface shadow-pop">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={id} className="text-lg font-semibold leading-snug">{title}</h2>
            {subtitle && <div className="mt-1 text-[13px] text-muted">{subtitle}</div>}
          </div>
          <div className="flex items-center gap-1">{actions}<IconButton icon="x" label="סגור" onClick={onClose} /></div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scroll-thin">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- toasts (with undo) ---------------- */
interface Toast { id: number; text: string; tone: 'success' | 'error' | 'info'; undo?: () => void | Promise<void> }
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-3), { ...t, id }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), t.undo ? 7000 : 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-[60] flex flex-col items-center gap-2 sm:left-auto sm:right-4 sm:items-end" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="pop-in pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-pop">
            <span className={t.tone === 'error' ? 'text-failed' : t.tone === 'success' ? 'text-working' : 'text-review'}><Icon name={t.tone === 'error' ? 'alert' : t.tone === 'success' ? 'check' : 'info'} /></span>
            <span className="text-ink">{t.text}</span>
            {t.undo && (
              <button type="button" className="ms-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-semibold text-primary hover:bg-primary-soft"
                onClick={async () => { setItems((x) => x.filter((i) => i.id !== t.id)); await t.undo?.(); }}>
                <Icon name="undo" size={14} />ביטול
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------- confirm dialog (promise based) ---------------- */
interface ConfirmOpts { title: string; text: string; confirm: string; danger?: boolean }
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Dialog open={!!state} onClose={() => close(false)} title={state?.title ?? ''} width={420}
        footer={<><Button onClick={() => close(false)}>ביטול</Button><Button data-autofocus variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{state?.confirm}</Button></>}>
        <p className="text-sm leading-relaxed text-ink-2">{state?.text}</p>
      </Dialog>
    </ConfirmCtx.Provider>
  );
}

/* ---------------- misc ---------------- */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ltr inline-grid h-5 min-w-5 place-items-center rounded border border-line bg-surface-2 px-1 font-sans text-[11px] text-ink-2">{children}</kbd>;
}
export function ProgressBar({ value, tone = 'primary', label }: { value: number; tone?: 'primary' | 'working' | 'needs' | 'failed'; label: string }) {
  const c = { primary: 'bg-primary', working: 'bg-working', needs: 'bg-needs', failed: 'bg-failed' }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className={`h-full rounded-full transition-[width] duration-500 ${c}`} style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} />
    </div>
  );
}
