import {
  MemoryModel,
  attemptToOutcome,
  baseRetrievalStrength,
} from "./MemoryModel";
import {
  MemoryState,
  MemoryRecommendation,
  RetrievalOutcome,
} from "../types";
import { CAESARCoefficients } from "../config";
import { DAY_MS, clamp } from "../math";

/**
 * CAESAR provisional memory model.
 *
 * This is deliberately simple and inspectable:
 *
 * R(t) = (1 + t / S)^(-d)
 *
 * where:
 *   R = predicted retrievability
 *   t = elapsed days
 *   S = stability in days
 *   d = memory-difficulty exponent
 *
 * It is NOT a claim that this equation is the final CAESAR memory model.
 * Replace this implementation with a validated FSRS adapter after benchmarking.
 */
export class PowerLawMemoryModel implements MemoryModel {
  readonly id = "caesar-power-law";
  readonly version = "0.2.0";

  constructor(
    private readonly coefficients: CAESARCoefficients
  ) {}

  initialize(
    difficulty: number,
    now: number
  ): MemoryState {
    return {
      stability: this.coefficients.memory.initialStabilityDays,
      difficulty: clamp(
        0.35 + (difficulty - 1) * 0.12,
        0.2,
        0.9
      ),
      retrievability: 1,
      lastReviewAt: undefined,
      reviewCount: 0,
      successCount: 0,
      failureCount: 0,
      learningStep: 0,
      modelId: this.id,
      modelVersion: this.version,
    };
  }

  predictRetrievability(
    state: MemoryState,
    now: number
  ): number {
    if (
      state.reviewCount === 0 ||
      state.lastReviewAt == null
    ) {
      return 1;
    }

    const elapsedDays = Math.max(
      0,
      (now - state.lastReviewAt) / DAY_MS
    );

    const exponent =
      0.80 + state.difficulty * 0.45;

    return clamp(
      Math.pow(
        1 + elapsedDays / Math.max(0.05, state.stability),
        -exponent
      )
    );
  }

  update(
    state: MemoryState,
    outcome: RetrievalOutcome,
    now: number
  ): MemoryState {
    const previousReviewAt =
      state.lastReviewAt;

    const strength =
      baseRetrievalStrength(
        outcome,
        this.coefficients
      );

    const previousR =
      this.predictRetrievability(
        state,
        now
      );

    const elapsedDays =
      previousReviewAt == null
        ? 0
        : Math.max(
            0,
            (now - previousReviewAt) / DAY_MS
          );

    const next: MemoryState = {
      ...state,
      reviewCount: state.reviewCount + 1,
      lastReviewAt: now,
      retrievability: previousR,
    };

    if (strength >= 0.8) {
      const delayedBonus =
        elapsedDays >= 3
          ? this.coefficients.memory.delayedReviewBonus
          : 0;

      const confidenceBonus =
        outcome.confidence != null &&
        outcome.confidence >= 4
          ? this.coefficients.memory
              .successGrowthConfidenceBonus
          : 0;

      const assistedMultiplier =
        outcome.hintsUsed > 0
          ? this.coefficients.memory
              .hintAssistedMultiplier
          : 1;

      const growth =
        1 +
        this.coefficients.memory
          .successGrowthBase *
          0.10 +
        delayedBonus +
        confidenceBonus;

      next.stability = clamp(
        state.stability *
          growth *
          assistedMultiplier,
        this.coefficients.memory
          .minimumStabilityDays,
        this.coefficients.memory
          .maximumStabilityDays
      );

      next.successCount += 1;
      next.learningStep = Math.min(
        8,
        state.learningStep + 1
      );
    } else {
      const penalty =
        outcome.result === "incorrect"
          ? this.coefficients.memory
              .failureStabilityMultiplier
          : 0.82;

      next.stability = clamp(
        state.stability * penalty,
        this.coefficients.memory
          .minimumStabilityDays,
        this.coefficients.memory
          .maximumStabilityDays
      );

      next.failureCount += 1;
      next.learningStep = Math.max(
        0,
        state.learningStep - 1
      );
    }

    next.difficulty = clamp(
      state.difficulty +
        (strength < 0.35
          ? 0.025
          : strength > 0.9
            ? -0.01
            : 0),
      0.05,
      0.95
    );

    next.retrievability =
      this.predictRetrievability(
        next,
        now
      );

    return next;
  }

  recommend(
    state: MemoryState,
    now: number,
    targetRetrievability: number
  ): MemoryRecommendation {
    const target = clamp(
      targetRetrievability,
      0.50,
      0.98
    );

    const retrievability =
      this.predictRetrievability(
        state,
        now
      );

    const exponent =
      0.80 + state.difficulty * 0.45;

    const factor =
      Math.pow(
        target,
        -1 / exponent
      ) - 1;

    const intervalDays =
      clamp(
        state.stability * factor,
        this.coefficients.memory
          .minimumStabilityDays,
        this.coefficients.memory
          .maximumStabilityDays
      );

    return {
      retrievability,
      memoryNeed: clamp(
        1 - retrievability
      ),
      recommendedIntervalMs:
        intervalDays * DAY_MS,
      dueAt:
        now + intervalDays * DAY_MS,
      targetRetrievability: target,
      modelId: this.id,
      modelVersion: this.version,
    };
  }
}
