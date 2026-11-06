// Practice Engine — FSRS & SM-2 scheduler ported from Nihon 2.1.0 (L413+)
export const RETRIEVAL_EFFORTS = [
  { id: "FAST_CONFIDENT", code: "FC", label: "Instant Recall" },
  { id: "DELIBERATE", code: "DS", label: "Deliberate Search" },
  { id: "MENTAL_CALC", code: "MC", label: "Mental Math" },
  { id: "TOOL_CALC", code: "TC", label: "Scratchpad / Calc" },
  { id: "EDUCATED_GUESS", code: "EG", label: "Educated Guess" },
  { id: "BLANK", code: "BL", label: "Complete Blank" },
] as const;

export const ACCURACY_DIAGNOSTICS = [
  { id: "FLAWLESS", code: "FL", label: "Flawless & Complete" },
  { id: "FACTUAL_SLIP", code: "FS", label: "Factual / Calc Slip" },
  { id: "PARTIAL_CONCEPTS", code: "PC", label: "Partial Concepts" },
  { id: "CONFIDENT_FLAW", code: "CF", label: "Confident Misconception" },
  { id: "TOTAL_FAILURE", code: "TF", label: "Total Failure" },
] as const;

export interface CardMeta {
  id?: string;
  due: string;
  ivl: number;
  reps: number;
  diff: number;
  s: number;
  d: number;
  lapses: number;
  attempts: number;
  hist: string[];
}

function addDays(today: string, n: number): string {
  const d = new Date(today + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

function generateCardId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function calculateNextReview(meta: Partial<CardMeta>, effortId: string, accuracyId: string, today: string, settings: { schedulerMode?: string; targetRetention?: number } = {}): CardMeta {
  if ((settings.schedulerMode || "fsrs") === "fsrs") {
    return calculateNextReviewFSRS(meta, effortId, accuracyId, today, settings.targetRetention ?? 0.9);
  }
  return calculateNextReviewSM2(meta, effortId, accuracyId, today);
}

export function calculateNextReviewFSRS(meta: Partial<CardMeta>, effortId: string, accuracyId: string, today: string, targetRetention = 0.9): CardMeta {
  const effort = RETRIEVAL_EFFORTS.find((e) => e.id === effortId) ?? RETRIEVAL_EFFORTS[0]!;
  if (effortId === "BLANK") accuracyId = "TOTAL_FAILURE";
  const acc = ACCURACY_DIAGNOSTICS.find((a) => a.id === accuracyId) ?? ACCURACY_DIAGNOSTICS[0]!;
  let grade = 3;
  if (accuracyId === "TOTAL_FAILURE" || effortId === "BLANK" || accuracyId === "CONFIDENT_FLAW") grade = 1;
  else if (accuracyId === "PARTIAL_CONCEPTS" || effortId === "EDUCATED_GUESS") grade = 2;
  else if (accuracyId === "FACTUAL_SLIP" || effortId === "DELIBERATE" || effortId === "TOOL_CALC") grade = 3;
  else if (accuracyId === "FLAWLESS" && (effortId === "FAST_CONFIDENT" || effortId === "MENTAL_CALC")) grade = 4;

  const next: CardMeta = {
    id: meta.id || generateCardId(),
    due: today,
    ivl: meta.ivl ?? 1,
    reps: meta.reps ?? 0,
    diff: meta.diff ?? 3.0,
    s: meta.s ?? 1.0,
    d: meta.d ?? 5.0,
    lapses: meta.lapses ?? 0,
    attempts: (meta.attempts ?? 0) + 1,
    hist: [...(meta.hist ?? [])],
  };

  const lastHist = next.hist[next.hist.length - 1];
  const elapsed = lastHist ? daysBetween(lastHist.split(":")[0]!, today) : next.ivl;
  const retrievability = Math.pow(0.9, elapsed / Math.max(0.1, next.s));

  if (next.attempts === 1 || !meta.s) {
    const initStabilities: Record<number, number> = { 1: 0.4, 2: 1.2, 3: 3.2, 4: 8.0 };
    next.s = initStabilities[grade] ?? 2.0;
    next.d = Math.min(10.0, Math.max(1.0, 5.0 - (grade - 3) * 1.5));
    if (accuracyId === "CONFIDENT_FLAW") {
      next.d = Math.min(10.0, next.d + 2.5);
      next.s = 0.4;
      next.lapses += 1;
    }
    next.reps = grade >= 3 ? 1 : 0;
  } else if (grade >= 2) {
    const deltaD = -0.5 * (grade - 3);
    next.d = Math.min(10.0, Math.max(1.0, next.d + deltaD));
    const gradeMultiplier = grade === 2 ? 0.75 : grade === 3 ? 1.0 : 1.4;
    let growthFactor = 1.0 + (11.0 - next.d) * Math.pow(next.s, -0.2) * (Math.exp(0.5 * (1.0 - retrievability)) - 1.0) * gradeMultiplier;
    if ((effortId === "DELIBERATE" || effortId === "MENTAL_CALC") && accuracyId === "FLAWLESS") growthFactor *= 1.25;
    next.s = Math.max(next.s + 1.0, next.s * growthFactor);
    next.reps += 1;
    next.diff = Math.max(1.0, next.diff - (grade === 4 ? 0.15 : 0.05));
  } else {
    next.lapses += 1;
    next.reps = 0;
    if (accuracyId === "CONFIDENT_FLAW") {
      next.d = Math.min(10.0, next.d + 2.5);
      next.s = 0.4;
      next.diff = Math.min(5.0, next.diff + 0.6);
    } else {
      next.d = Math.min(10.0, next.d + 1.2);
      next.s = Math.max(0.5, next.s * 0.25);
      next.diff = Math.min(5.0, next.diff + 0.3);
    }
  }

  const factor = Math.log(targetRetention) / Math.log(0.9);
  next.ivl = Math.max(1, Math.round(next.s * factor));
  next.due = addDays(today, next.ivl);
  next.hist.push(`${today}:${effort.code}:${acc.code}`);
  next.hist = next.hist.slice(-10);
  return next;
}

export function calculateNextReviewSM2(meta: Partial<CardMeta>, effortId: string, accuracyId: string, today: string): CardMeta {
  const effort = RETRIEVAL_EFFORTS.find((e) => e.id === effortId) ?? RETRIEVAL_EFFORTS[0]!;
  if (effortId === "BLANK") accuracyId = "TOTAL_FAILURE";
  const acc = ACCURACY_DIAGNOSTICS.find((a) => a.id === accuracyId) ?? ACCURACY_DIAGNOSTICS[0]!;
  const next: CardMeta = {
    id: meta.id || generateCardId(),
    due: today,
    ivl: meta.ivl ?? 1,
    reps: meta.reps ?? 0,
    diff: meta.diff ?? 3.0,
    s: meta.s ?? 1.0,
    d: meta.d ?? 5.0,
    lapses: meta.lapses ?? 0,
    attempts: (meta.attempts ?? 0) + 1,
    hist: [...(meta.hist ?? [])],
  };
  let grade = 3;
  if (accuracyId === "TOTAL_FAILURE" || effortId === "BLANK") grade = 0;
  else if (accuracyId === "CONFIDENT_FLAW") grade = 1;
  else if (accuracyId === "PARTIAL_CONCEPTS" || effortId === "EDUCATED_GUESS") grade = 2;
  else if (accuracyId === "FACTUAL_SLIP") grade = 3;
  else if (accuracyId === "FLAWLESS") grade = effortId === "DELIBERATE" || effortId === "MENTAL_CALC" ? 5 : 4;
  const ease = Math.max(1.3, 2.8 - next.diff * 0.3);
  if (grade < 3) {
    next.reps = 0;
    next.ivl = 1;
    next.lapses += 1;
    next.diff = Math.min(5.0, next.diff + (accuracyId === "CONFIDENT_FLAW" ? 0.6 : 0.3));
  } else {
    next.reps += 1;
    if (next.reps === 1) next.ivl = 1;
    else if (next.reps === 2) next.ivl = 6;
    else next.ivl = Math.round(next.ivl * ease);
    if (grade === 5) next.diff = Math.max(1.0, next.diff - 0.15);
    else if (grade === 4 && effortId === "FAST_CONFIDENT") next.diff = Math.max(1.0, next.diff - 0.1);
  }
  next.due = addDays(today, next.ivl);
  next.hist.push(`${today}:${effort.code}:${acc.code}`);
  next.hist = next.hist.slice(-10);
  return next;
}
