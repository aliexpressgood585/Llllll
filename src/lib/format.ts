export const fmtUsd = (v: number, dp = 0): string => {
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
};

export const fmtSignedUsd = (v: number, dp = 0): string => `${v >= 0 ? '+' : '-'}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

export const fmtCompactUsd = (v: number, signed = false): string => {
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : signed ? '+' : '';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  return `${sign}$${a.toFixed(a >= 100 ? 0 : 2)}`;
};

export const fmtNum = (v: number, dp = 2): string => v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const fmtSigned = (v: number, dp = 2): string => `${v >= 0 ? '+' : ''}${fmtNum(v, dp)}`;

export const fmtPct = (v: number, dp = 1, signed = false): string => `${signed && v >= 0 ? '+' : ''}${(v * 100).toFixed(dp)}%`;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** 24MAY26 style expiry code */
export const fmtExpiry = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getUTCDate()).padStart(2, '0')}${MONTHS[d.getUTCMonth()]}${String(d.getUTCFullYear()).slice(2)}`;
};

export const fmtExpiryLong = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
};

export const fmtTime = (ts: number, seconds = true): string => {
  const d = new Date(ts);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return seconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
};

export const fmtDate = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]}`;
};

export const pnlClass = (v: number): string => (v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-muted');

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
