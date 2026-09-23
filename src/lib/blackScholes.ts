export type OptionType = 'C' | 'P';

export interface Greeks {
  price: number;
  delta: number;
  gamma: number;
  /** $ change per 1 vol point (0.01) */
  vega: number;
  /** $ change per calendar day */
  theta: number;
  /** $ change per 1% rate move */
  rho: number;
}

const INV_SQRT_2PI = 0.3989422804014327;

export function normPdf(x: number): number {
  return INV_SQRT_2PI * Math.exp(-0.5 * x * x);
}

/** Cumulative normal, Hart / W. J. Cody style rational approximation (abs err < 1e-7). */
export function normCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * ax);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

export function intrinsic(S: number, K: number, type: OptionType): number {
  return type === 'C' ? Math.max(S - K, 0) : Math.max(K - S, 0);
}

/** Black-Scholes price only (fast path). T in years. */
export function bsPrice(S: number, K: number, T: number, r: number, sigma: number, type: OptionType): number {
  if (T <= 1e-9 || sigma <= 1e-6) return intrinsic(S, K, type);
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const df = Math.exp(-r * T);
  return type === 'C' ? S * normCdf(d1) - K * df * normCdf(d2) : K * df * normCdf(-d2) - S * normCdf(-d1);
}

export function bsGreeks(S: number, K: number, T: number, r: number, sigma: number, type: OptionType): Greeks {
  if (T <= 1e-9 || sigma <= 1e-6) {
    const itm = type === 'C' ? S > K : S < K;
    return { price: intrinsic(S, K, type), delta: itm ? (type === 'C' ? 1 : -1) : 0, gamma: 0, vega: 0, theta: 0, rho: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const df = Math.exp(-r * T);
  const pdf = normPdf(d1);
  const gamma = pdf / (S * sigma * sqrtT);
  const vega = (S * pdf * sqrtT) / 100;
  if (type === 'C') {
    const Nd1 = normCdf(d1);
    const Nd2 = normCdf(d2);
    return {
      price: S * Nd1 - K * df * Nd2,
      delta: Nd1,
      gamma,
      vega,
      theta: ((-S * pdf * sigma) / (2 * sqrtT) - r * K * df * Nd2) / 365,
      rho: (K * T * df * Nd2) / 100,
    };
  }
  const Nmd1 = normCdf(-d1);
  const Nmd2 = normCdf(-d2);
  return {
    price: K * df * Nmd2 - S * Nmd1,
    delta: -Nmd1,
    gamma,
    vega,
    theta: ((-S * pdf * sigma) / (2 * sqrtT) + r * K * df * Nmd2) / 365,
    rho: (-K * T * df * Nmd2) / 100,
  };
}
