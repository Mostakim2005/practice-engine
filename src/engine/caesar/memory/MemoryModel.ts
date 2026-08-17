import {
  AttemptEvent,
  MemoryState,
  MemoryRecommendation,
  RetrievalOutcome,
} from "../types";
import { CAESARCoefficients } from "../config";

export interface MemoryModel {
  readonly id: string;
  readonly version: string;

  initialize(difficulty: number, now: number): MemoryState;

  predictRetrievability(
    state: MemoryState,
    now: number
  ): number;

  update(
    state: MemoryState,
    outcome: RetrievalOutcome,
    now: number
  ): MemoryState;

  recommend(
    state: MemoryState,
    now: number,
    targetRetrievability: number
  ): MemoryRecommendation;
}

export function attemptToOutcome(
  event: AttemptEvent,
  previousReviewAt?: number
): RetrievalOutcome {
  return {
    result: event.correctness,
    score: event.score,
    confidence: event.confidence,
    responseTimeMs: event.responseTimeMs,
    hintsUsed: event.hintsUsed,
    highestHintLevel: event.highestHintLevel,
    answerRevealed: event.answerRevealed,
    elapsedSincePreviousReviewMs:
      previousReviewAt == null
        ? undefined
        : Math.max(0, event.timestamp - previousReviewAt),
  };
}

export function baseRetrievalStrength(
  outcome: RetrievalOutcome,
  coefficients: CAESARCoefficients
): number {
  if (outcome.answerRevealed) {
    return 1 - coefficients.evidence.revealPenalty;
  }

  let strength = 0;

  switch (outcome.result) {
    case "correct":
      strength = 1;
      break;
    case "partial":
      strength = Math.max(0, Math.min(1, outcome.score ?? 0.5)) *
        coefficients.evidence.partialCreditWeight;
      break;
    case "incorrect":
      strength = 0;
      break;
    case "unanswered":
      strength = 0.05;
      break;
  }

  if (outcome.hintsUsed > 0) {
    const hintPenalty = Math.min(
      0.6,
      outcome.hintsUsed * coefficients.evidence.hintPenaltyPerLevel
    );
    strength *= 1 - hintPenalty;
  }

  if (
    outcome.result === "correct" &&
    outcome.hintsUsed === 0
  ) {
    strength = Math.min(
      1,
      strength + coefficients.evidence.independentSuccessBonus
    );
  }

  if (
    outcome.result === "correct" &&
    (outcome.elapsedSincePreviousReviewMs ?? 0) >= 3 * 86_400_000
  ) {
    strength = Math.min(
      1,
      strength + coefficients.evidence.delayedSuccessBonus
    );
  }

  return Math.max(0, Math.min(1, strength));
}
