export const DAY_MS = 86_400_000;

export function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t);
}

export function gaussianFit(value: number, target: number, sigma: number): number {
  const safeSigma = Math.max(0.05, sigma);
  const z = (value - target) / safeSigma;
  return Math.exp(-0.5 * z * z);
}

export function logistic(x: number, midpoint = 0, slope = 1): number {
  const z = Math.max(-40, Math.min(40, slope * (x - midpoint)));
  return 1 / (1 + Math.exp(-z));
}

export function mean(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter(
    (value): value is number => value != null && Number.isFinite(value)
  );
  if (!filtered.length) return null;
  return filtered.reduce((a, b) => a + b, 0) / filtered.length;
}

export function weightedMean(
  values: Array<{ value: number; weight: number }>
): number | null {
  const filtered = values.filter(
    (x) => Number.isFinite(x.value) && Number.isFinite(x.weight) && x.weight > 0
  );
  const denominator = filtered.reduce((s, x) => s + x.weight, 0);
  if (!denominator) return null;
  return filtered.reduce((s, x) => s + x.value * x.weight, 0) / denominator;
}

export function daysBetween(now: number, then?: number): number {
  if (then == null) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now - then) / DAY_MS);
}

export function triangularScore(
  value: number,
  low: number,
  ideal: number,
  high: number
): number {
  if (value <= low || value >= high) return 0;
  if (value === ideal) return 1;
  if (value < ideal) return clamp((value - low) / (ideal - low));
  return clamp((high - value) / (high - ideal));
}

export function softmax(
  values: number[],
  temperature = 0.2
): number[] {
  const t = Math.max(0.01, temperature);
  const m = Math.max(...values);
  const exp = values.map((v) => Math.exp((v - m) / t));
  const sum = exp.reduce((a, b) => a + b, 0);
  return sum ? exp.map((v) => v / sum) : values.map(() => 0);
}

export function makeId(prefix: string): string {
  const id =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}
