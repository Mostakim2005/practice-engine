import {
  AttemptEvent,
  CAESARLearnerState,
  PersonalizationState,
} from "../types";
import {
  CAESARCoefficients,
} from "../config";
import { clamp } from "../math";

export interface PersonalEstimate {
  value: number;
  populationValue: number;
  personalWeight: number;
  evidenceCount: number;
}

export class PersonalizationModel {
  constructor(
    private readonly coefficients: CAESARCoefficients
  ) {}

  update(
    current: PersonalizationState | undefined,
    learnerId: string,
    event: AttemptEvent
  ): PersonalizationState {
    const prior: PersonalizationState =
      current ?? {
        learnerId,
        evidenceCount: 0,
        difficultyBias: 0,
        guidanceDependence: 0,
        confidenceCalibrationGap: 0,
        personalWeight: 0,
      };

    const n =
      prior.evidenceCount + 1;

    const outcome =
      event.correctness === "correct"
        ? 1
        : event.correctness === "partial"
          ? clamp(
              event.score ??
                0.5
            )
          : 0;

    const observedDifficultyBias =
      0.5 - outcome;

    const difficultyBias =
      prior.difficultyBias +
      (observedDifficultyBias -
        prior.difficultyBias) *
        0.08;

    const guidance =
      event.hintsUsed > 0
        ? 1
        : 0;

    const guidanceDependence =
      prior.guidanceDependence +
      (guidance -
        prior.guidanceDependence) *
        0.08;

    const calibrationGap =
      event.confidence == null
        ? 0
        : Math.abs(
            event.confidence /
              5 -
              outcome
          );

    const confidenceCalibrationGap =
      prior.confidenceCalibrationGap +
      (calibrationGap -
        prior.confidenceCalibrationGap) *
        0.08;

    const rawWeight =
      n /
      (n +
        this.coefficients
          .personalization
          .priorStrength);

    return {
      ...prior,
      evidenceCount: n,
      difficultyBias,
      guidanceDependence,
      confidenceCalibrationGap,
      personalWeight: clamp(
        rawWeight,
        0,
        this.coefficients
          .personalization
          .maxInfluence
      ),
    };
  }

  influence(
    state: CAESARLearnerState
  ): number {
    return clamp(
      state.personalization
        ?.personalWeight ?? 0,
      0,
      this.coefficients
        .personalization
        .maxInfluence
    );
  }

  getDifficultyModifier(
    state: CAESARLearnerState
  ): number {
    return clamp(
      -(
        state.personalization
          ?.difficultyBias ?? 0
      ),
      -0.25,
      0.25
    );
  }

  getCalibrationNeed(
    state: CAESARLearnerState
  ): number {
    return clamp(
      state.personalization
        ?.confidenceCalibrationGap ??
        0
    );
  }
}
