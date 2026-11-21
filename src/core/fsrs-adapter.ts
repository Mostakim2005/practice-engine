import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type Grade,
} from "ts-fsrs";
import { ACCURACY_DIAGNOSTICS, RETRIEVAL_EFFORTS, type CardMeta } from "../types";

export const MINIMUM_INTERVAL_GUARD = 1;

export function fmtLocalDate(d: Date): string {
  const p = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function todayLocalStr(): string {
  return fmtLocalDate(new Date());
}

export function addLocalDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return fmtLocalDate(new Date(y || 1970, (m || 1) - 1, (d || 1) + Math.round(days)));
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  const da = new Date(y1 || 1970, (m1 || 1) - 1, d1 || 1).getTime();
  const db = new Date(y2 || 1970, (m2 || 1) - 1, d2 || 1).getTime();
  return Math.max(0, Math.round((db - da) / (1000 * 60 * 60 * 24)));
}

export function generateCardId(): string {
  return `c_${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultMeta(id?: string): CardMeta {
  return {
    id: id || generateCardId(),
    due: todayLocalStr(),
    ivl: 1,
    reps: 0,
    diff: 3.0,
    s: 1.0,
    d: 5.0,
    lapses: 0,
    attempts: 0,
    hist: [],
  };
}

export function mapTwoStageToFsrsGrade(effortId: string, accuracyId: string): Grade {
  if (effortId === "BLANK" || accuracyId === "TOTAL_FAILURE" || accuracyId === "CONFIDENT_FLAW") {
    return Rating.Again;
  }
  if (accuracyId === "PARTIAL_CONCEPTS" || effortId === "EDUCATED_GUESS") {
    return Rating.Hard;
  }
  if (accuracyId === "FLAWLESS" && (effortId === "FAST_CONFIDENT" || effortId === "MENTAL_CALC")) {
    return Rating.Easy;
  }
  return Rating.Good;
}

export function isLeechCard(meta: Partial<CardMeta>, lapseThreshold = 5): boolean {
  if ((meta.lapses ?? 0) >= lapseThreshold) return true;
  const recent = (meta.hist ?? []).slice(-5);
  return recent.filter((h) => h.endsWith(":CF")).length >= 2;
}

export function scheduleWithTsFsrs(
  meta: Partial<CardMeta>,
  effortId: string,
  accuracyId: string,
  today = todayLocalStr(),
  targetRetention = 0.9
): CardMeta {
  const normalizedAccuracy = effortId === "BLANK" ? "TOTAL_FAILURE" : accuracyId;
  const effort = RETRIEVAL_EFFORTS.find((e) => e.id === effortId) ?? RETRIEVAL_EFFORTS[0]!;
  const accuracy =
    ACCURACY_DIAGNOSTICS.find((a) => a.id === normalizedAccuracy) ?? ACCURACY_DIAGNOSTICS[0]!;

  const safeRetention = Math.min(0.99, Math.max(0.5, Number(targetRetention) || 0.9));
  const params = generatorParameters({ request_retention: safeRetention, enable_fuzz: true });
  const scheduler = fsrs(params);
  const now = new Date(`${today}T12:00:00`);

  const baseCard: Card = createEmptyCard(now);
  if (meta.attempts && meta.attempts > 0) {
    const lastHistEntry = meta.hist && meta.hist.length > 0 ? meta.hist[meta.hist.length - 1] : undefined;
    const lastDateStr = lastHistEntry ? lastHistEntry.split(":")[0] : undefined;
    const lastReviewDate = lastDateStr
      ? new Date(`${lastDateStr}T12:00:00`)
      : new Date(`${addLocalDays(today, -(meta.ivl ?? 1))}T12:00:00`);
    const elapsed = lastDateStr ? daysBetween(lastDateStr, today) : Math.max(1, meta.ivl ?? 1);

    baseCard.state = (meta.reps ?? 0) > 0 ? State.Review : State.Relearning;
    baseCard.stability = Math.max(0.1, meta.s ?? 1.0);
    baseCard.difficulty = Math.min(10, Math.max(1, meta.d ?? 5.0));
    baseCard.reps = meta.reps ?? 0;
    baseCard.lapses = meta.lapses ?? 0;
    baseCard.scheduled_days = Math.max(MINIMUM_INTERVAL_GUARD, meta.ivl ?? 1);
    baseCard.elapsed_days = elapsed;
    baseCard.last_review = lastReviewDate;
    baseCard.due = meta.due ? new Date(`${meta.due}T12:00:00`) : now;
  }

  const grade = mapTwoStageToFsrsGrade(effortId, normalizedAccuracy);
  const record = scheduler.next(baseCard, now, grade);
  const updated = record.card;

  let finalDifficulty = updated.difficulty;
  let finalStability = updated.stability;
  if (normalizedAccuracy === "CONFIDENT_FLAW") {
    // Extra metacognitive penalty for confident misconceptions
    finalDifficulty = Math.min(10, finalDifficulty + 1.0);
    finalStability = Math.max(0.4, Math.min(finalStability, 0.5));
  }

  const ivl = Math.max(MINIMUM_INTERVAL_GUARD, Math.round(updated.scheduled_days || 1));

  return {
    id: meta.id || generateCardId(),
    due: addLocalDays(today, ivl),
    ivl,
    reps: updated.reps,
    diff: Number((finalDifficulty / 2).toFixed(1)),
    s: Number(finalStability.toFixed(2)),
    d: Number(finalDifficulty.toFixed(2)),
    lapses: updated.lapses,
    attempts: (meta.attempts ?? 0) + 1,
    hist: [...(meta.hist ?? []), `${today}:${effort.code}:${accuracy.code}`].slice(-20),
    ankiNoteId: meta.ankiNoteId,
  };
}
