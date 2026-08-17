import {
  CandidateFeatures,
  CandidateScore,
  LearningObjective,
  LearningIntervention,
} from "../types";
import {
  CAESARCoefficients,
} from "../config";
import { clamp } from "../math";

export class UtilityModel {
  constructor(
    private readonly coefficients: CAESARCoefficients
  ) {}

  score(
    features: CandidateFeatures,
    objective: LearningObjective,
    intervention: LearningIntervention
  ): CandidateScore {
    const objectiveFit =
      this.objectiveFit(
        features,
        objective
      );

    const interventionFit =
      this.interventionFit(
        features,
        intervention
      );

    const totalUtility =
      features.memoryNeed *
        this.coefficients.utility
          .memoryNeed +
      features.conceptWeakness *
        this.coefficients.utility
          .conceptWeakness +
      features.proceduralWeakness *
        this.coefficients.utility
          .proceduralWeakness +
      features.transferNeed *
        this.coefficients.utility
          .transferNeed +
      features.errorRepair *
        this.coefficients.utility
          .errorRepair +
      features.calibrationNeed *
        this.coefficients.utility
          .calibrationNeed +
      features.prerequisiteNeed *
        this.coefficients.utility
          .prerequisiteNeed +
      features.contrastValue *
        this.coefficients.utility
          .contrastValue +
      features.representationNovelty *
        this.coefficients.utility
          .representationNovelty +
      features.familyNovelty *
        this.coefficients.utility
          .familyNovelty +
      features.difficultyFit *
        this.coefficients.utility
          .difficultyFit +
      features.importance *
        this.coefficients.utility
          .importance +
      features.explorationValue *
        this.coefficients.utility
          .explorationValue +
      objectiveFit *
        this.coefficients.utility
          .objectiveFit +
      interventionFit *
        this.coefficients.utility
          .interventionFit -
      features.repetitionCost *
        this.coefficients.utility
          .repetitionCost -
      features.loadRisk *
        this.coefficients.utility
          .loadRisk -
      features.fatigueCost *
        this.coefficients.utility
          .fatigueCost -
      features.disruptionCost *
        this.coefficients.utility
          .disruptionCost;

    return {
      ...features,
      objectiveFit,
      interventionFit,
      totalUtility,
    };
  }

  private objectiveFit(
    features: CandidateFeatures,
    objective: LearningObjective
  ): number {
    switch (objective) {
      case "retrieve":
      case "repair-memory":
        return features.memoryNeed;

      case "repair-concept":
        return clamp(
          features.conceptWeakness *
            0.55 +
          features.errorRepair *
            0.45
        );

      case "repair-procedure":
        return features.proceduralWeakness;

      case "discriminate":
        return clamp(
          features.contrastValue *
            0.6 +
          features.errorRepair *
            0.4
        );

      case "transfer":
        return features.transferNeed;

      case "calibrate":
        return features.calibrationNeed;

      case "maintain":
        return clamp(
          features.memoryNeed *
            0.7 +
          features.importance *
            0.3
        );

      case "encode":
        return features.conceptWeakness;

      default:
        return clamp(
          features.conceptWeakness *
            0.4 +
          features.memoryNeed *
            0.3 +
          features.transferNeed *
            0.3
        );
    }
  }

  private interventionFit(
    features: CandidateFeatures,
    intervention: LearningIntervention
  ): number {
    switch (intervention) {
      case "contrast":
      case "comparison":
        return features.contrastValue;

      case "representation-switch":
        return features.representationNovelty;

      case "transfer":
        return features.transferNeed;

      case "retrieval":
      case "maintenance":
        return features.memoryNeed;

      case "completion-problem":
      case "guided-retrieval":
        return clamp(
          features.proceduralWeakness *
            0.6 +
          (1 -
            features.loadRisk) *
            0.4
        );

      default:
        return clamp(
          features.conceptWeakness *
            0.5 +
          (1 -
            features.loadRisk) *
            0.5
        );
    }
  }
}
