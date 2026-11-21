import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from "ts-fsrs";
import type { CardMeta } from "../types";

export const MINIMUM_INTERVAL_GUARD = 1;

function fmtLocalDate(d: Date): string {
  const p = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addLocalDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return fmtLocalDate(new Date(y!, (m! || 1) - 1, (d! || 1) + Math.round(days)));
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
  today: string,
  targetRetention = 0.9
): CardMeta {
  const safeRetention = Math.min(0.99, Math.max(0.5, Number(targetRetention) || 0.9));
  const params = generatorParameters({ request_retention: safeRetention, enable_fuzz: true });
  const scheduler = fsrs(params);
  const now = new Date(`${today}T12:00:00`);

  const baseCard: Card = createEmptyCard(now);
  if (meta.attempts && meta.attempts > 0) {
    baseCard.stability = Math.max(0.1, meta.s ?? 1.0);
    baseCard.difficulty = Math.min(10, Math.max(1, meta.d ?? 5.0));
    baseCard.reps = meta.reps ?? 0;
    baseCard.lapses = meta.lapses ?? 0;
    baseCard.scheduled_days = meta.ivl ?? 1;
  }

  const grade = mapTwoStageToFsrsGrade(effortId, accuracyId);
  const record = scheduler.next(baseCard, now, grade);
  const updated = record.card;

  const ivl = Math.max(MINIMUM_INTERVAL_GUARD, Math.round(updated.scheduled_days || 1));
  const effortCode = effortId.slice(0, 2).toUpperCase();
  const accCode = accuracyId.slice(0, 2).toUpperCase();

  return {
    id: meta.id || `c_${Math.random().toString(36).slice(2, 9)}`,
    due: addLocalDays(today, ivl),
    ivl,
    reps: updated.reps,
    diff: Number((updated.difficulty / 2).toFixed(1)),
    s: Number(updated.stability.toFixed(2)),
    d: Number(updated.difficulty.toFixed(2)),
    lapses: updated.lapses,
    attempts: (meta.attempts ?? 0) + 1,
    hist: [...(meta.hist ?? []), `${today}:${effortCode}:${accCode}`].slice(-20),
    ankiNoteId: meta.ankiNoteId,
  };
}
