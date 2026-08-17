import {
  CAESARLearnerState,
  CognitiveSessionState,
  LearningObjective,
  LearningPhase,
} from "../types";
import {
  CAESARCoefficients,
} from "../config";
import {
  clamp,
  mean,
} from "../math";

export interface CognitiveState {
  phase: LearningPhase;
  objective: LearningObjective;
  phaseConfidence: number;
  loadState: "low" | "moderate" | "high";
}

export class CognitiveStateModel {
  constructor(
    private readonly coefficients: CAESARCoefficients
  ) {}

  infer(
    state: CAESARLearnerState,
    session: CognitiveSessionState
  ): CognitiveState {
    const concepts =
      Object.values(
        state.conceptStates
      );

    if (!concepts.length) {
      return {
        phase: "acquisition",
        objective: "encode",
        phaseConfidence: 0.20,
        loadState: "low",
      };
    }

    const recent =
      concepts.slice(-30);

    const conceptual =
      mean(
        recent.map(
          (x) =>
            x.mastery.conceptual
        )
      ) ?? 0.5;

    const procedural =
      mean(
        recent.map(
          (x) =>
            x.mastery.procedural
        )
      ) ?? 0.5;

    const transfer =
      mean(
        recent.map(
          (x) =>
            x.mastery.transfer
        )
      ) ?? 0.5;

    const memoryNeed =
      mean(
        recent.map(
          (x) =>
            1 -
            (x.memory
              .retrievability ??
              1)
        )
      ) ?? 0.5;

    const misconception =
      recent.some(
        (x) =>
          x.errors
            .misconceptionActive
      );

    const prerequisite =
      recent.some(
        (x) =>
          x.errors
            .prerequisiteGapEvidenceCount >=
          this.coefficients.error
            .prerequisiteActivationCount
      );

    const sessionFatigue =
      clamp(
        session.fatigueEstimate ??
          0
      );

    const loadState =
      sessionFatigue >=
      this.coefficients.phase
        .highLoadThreshold
        ? "high"
        : sessionFatigue >= 0.30
          ? "moderate"
          : "low";

    if (
      prerequisite ||
      conceptual <
        this.coefficients.phase
          .acquisitionMasteryMax
    ) {
      return {
        phase: "acquisition",
        objective: "repair-concept",
        phaseConfidence: 0.72,
        loadState,
      };
    }

    if (misconception) {
      return {
        phase: "discrimination",
        objective: "discriminate",
        phaseConfidence: 0.80,
        loadState,
      };
    }

    if (
      memoryNeed >=
      this.coefficients.phase
        .memoryUrgencyThreshold
    ) {
      return {
        phase: "stabilization",
        objective: "retrieve",
        phaseConfidence: 0.76,
        loadState,
      };
    }

    if (
      procedural <
      this.coefficients.phase
        .stabilizationProceduralMax
    ) {
      return {
        phase: "stabilization",
        objective: "repair-procedure",
        phaseConfidence: 0.64,
        loadState,
      };
    }

    if (
      conceptual >=
        this.coefficients.phase
          .transferConceptualMin &&
      procedural >=
        this.coefficients.phase
          .transferProceduralMin &&
      transfer <
        this.coefficients.phase
          .maintenanceMasteryMin
    ) {
      return {
        phase: "transfer",
        objective: "transfer",
        phaseConfidence: 0.74,
        loadState,
      };
    }

    if (
      conceptual >=
        this.coefficients.phase
          .maintenanceMasteryMin &&
      procedural >=
        this.coefficients.phase
          .maintenanceMasteryMin &&
      transfer >=
        this.coefficients.phase
          .maintenanceMasteryMin
    ) {
      return {
        phase: "maintenance",
        objective: "maintain",
        phaseConfidence: 0.73,
        loadState,
      };
    }

    return {
      phase: "stabilization",
      objective: "stabilize",
      phaseConfidence: 0.55,
      loadState,
    };
  }
}
