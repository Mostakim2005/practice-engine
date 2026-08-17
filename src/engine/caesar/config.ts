/**
 * CAESAR coefficients v0.2 — evidence-informed provisional priors.
 *
 * IMPORTANT:
 * These are NOT empirically fitted constants. They are constrained priors
 * chosen after reviewing current learning-science/STEM evidence. They must
 * be calibrated against CAESAR's longitudinal data before being called
 * validated production coefficients.
 */
export interface CAESARCoefficients {
  utility: {
    memoryNeed: number;
    conceptWeakness: number;
    proceduralWeakness: number;
    transferNeed: number;
    errorRepair: number;
    calibrationNeed: number;
    prerequisiteNeed: number;
    contrastValue: number;
    representationNovelty: number;
    familyNovelty: number;
    difficultyFit: number;
    importance: number;
    explorationValue: number;
    objectiveFit: number;
    interventionFit: number;

    repetitionCost: number;
    loadRisk: number;
    fatigueCost: number;
    disruptionCost: number;
  };

  evidence: {
    partialCreditWeight: number;
    hintPenaltyPerLevel: number;
    revealPenalty: number;
    independentSuccessBonus: number;
    delayedSuccessBonus: number;
    highConfidenceErrorBonus: number;
    lowConfidenceSuccessBonus: number;
  };

  mastery: {
    learningRate: number;
    minEvidenceForStableState: number;
    transferNovelRepresentationBonus: number;
    delayedEvidenceBonus: number;
  };

  error: {
    misconceptionActivationCount: number;
    prerequisiteActivationCount: number;
    repeatedMethodErrorCount: number;
    errorDecayPerSuccessfulIndependentProbe: number;
  };

  phase: {
    acquisitionMasteryMax: number;
    memoryUrgencyThreshold: number;
    stabilizationProceduralMax: number;
    stabilizationTransferMax: number;
    transferConceptualMin: number;
    transferProceduralMin: number;
    maintenanceMasteryMin: number;
    highLoadThreshold: number;
  };

  difficulty: {
    targetByPhase: {
      acquisition: number;
      stabilization: number;
      discrimination: number;
      transfer: number;
      maintenance: number;
    };
    sigma: number;
    targetEffectiveDifficulty: number;
    difficultySigma: number;

    representationLoadWeight: number;
    interleavingLoadWeight: number;
    noveltyLoadWeight: number;
    timePressureWeight: number;
  };

  interleaving: {
    sameConceptPenalty: number;
    nearConceptBonus: number;
    contrastBonus: number;
    familySwitchBonus: number;
    representationSwitchBonus: number;
    farSwitchPenalty: number;

    // Keeps interleaving from becoming a universal objective.
    minimumConceptMasteryForFarSwitch: number;
    maxSameConceptStreak: number;
  };

  guidance: {
    novicePriorKnowledgeMax: number;
    noviceGuidanceLevel: number;
    intermediateGuidanceLevel: number;
    expertGuidanceLevel: number;
    fadeRate: number;
    highLoadGuidanceBonus: number;
  };

  transfer: {
    nearWeight: number;
    mediumWeight: number;
    farWeight: number;
    noveltyPenalty: number;
    prerequisiteSafetyThreshold: number;
  };

  personalization: {
    priorStrength: number;
    maxInfluence: number;
    minEvidenceForStrongInfluence: number;
    anomalyDampening: number;
  };

  memory: {
    targetRetrievability: number;
    initialStabilityDays: number;
    minimumStabilityDays: number;
    maximumStabilityDays: number;
    failureStabilityMultiplier: number;
    successGrowthBase: number;
    successGrowthConfidenceBonus: number;
    delayedReviewBonus: number;
    hintAssistedMultiplier: number;
  };
}

/**
 * v0.2 changes from v0.1:
 *
 * - Transfer and interleaving no longer dominate normal utility.
 * - Prerequisite repair receives a stronger gate.
 * - Difficulty target varies by learning phase.
 * - Guidance fading is explicit.
 * - Far interleaving requires adequate concept stability.
 * - Delayed evidence gets more weight than immediate success.
 *
 * Evidence rationale:
 * - 2026 STEM review supports retrieval, spacing, interleaving, elaboration,
 *   concrete examples and dual coding, while emphasizing disciplinary
 *   variation and learner readiness.
 * - 2025 expertise-reversal meta-analysis supports more assistance for low
 *   prior-knowledge learners and less assistance for high prior-knowledge
 *   learners.
 * - 2025 interleaving evidence found adaptive interleaving did not outperform
 *   random interleaving, so interleaving is deliberately capped/conditional.
 * - 2025/2026 retrieval and problem-solving research supports active retrieval
 *   and problem solving while warning against treating one instructional
 *   sequence as universally best.
 */
export const DEFAULT_CAESAR_COEFFICIENTS: CAESARCoefficients = {
  utility: {
    memoryNeed: 0.13,
    conceptWeakness: 0.15,
    proceduralWeakness: 0.11,
    transferNeed: 0.10,
    errorRepair: 0.12,
    calibrationNeed: 0.05,
    prerequisiteNeed: 0.11,
    contrastValue: 0.07,
    representationNovelty: 0.04,
    familyNovelty: 0.025,
    difficultyFit: 0.08,
    importance: 0.07,
    explorationValue: 0.025,
    objectiveFit: 0.08,
    interventionFit: 0.06,

    repetitionCost: 0.075,
    loadRisk: 0.10,
    fatigueCost: 0.055,
    disruptionCost: 0.045,
  },

  evidence: {
    partialCreditWeight: 0.60,
    hintPenaltyPerLevel: 0.10,
    revealPenalty: 0.90,
    independentSuccessBonus: 0.08,

    // Delayed independent retrieval is intentionally stronger evidence
    // for durable learning than immediate re-performance.
    delayedSuccessBonus: 0.18,

    highConfidenceErrorBonus: 0.15,
    lowConfidenceSuccessBonus: 0.08,
  },

  mastery: {
    learningRate: 0.18,
    minEvidenceForStableState: 6,

    // Novel representation is evidence about transfer, not automatically
    // evidence that the underlying concept is fully mastered.
    transferNovelRepresentationBonus: 0.06,
    delayedEvidenceBonus: 0.12,
  },

  error: {
    misconceptionActivationCount: 2,
    prerequisiteActivationCount: 2,
    repeatedMethodErrorCount: 2,
    errorDecayPerSuccessfulIndependentProbe: 0.20,
  },

  phase: {
    acquisitionMasteryMax: 0.45,
    memoryUrgencyThreshold: 0.60,
    stabilizationProceduralMax: 0.60,
    stabilizationTransferMax: 0.60,
    transferConceptualMin: 0.70,
    transferProceduralMin: 0.70,
    maintenanceMasteryMin: 0.78,
    highLoadThreshold: 0.65,
  },

  difficulty: {
    targetByPhase: {
      acquisition: 0.48,
      stabilization: 0.56,
      discrimination: 0.58,
      transfer: 0.62,
      maintenance: 0.55,
    },

    sigma: 0.21,
    targetEffectiveDifficulty: 0.58,
    difficultySigma: 0.21,

    // Effective difficulty is a behavioral approximation, not a brain-state
    // measurement.
    representationLoadWeight: 0.16,
    interleavingLoadWeight: 0.12,
    noveltyLoadWeight: 0.15,
    timePressureWeight: 0.08,
  },

  interleaving: {
    sameConceptPenalty: 0.30,
    nearConceptBonus: 0.10,
    contrastBonus: 0.25,
    familySwitchBonus: 0.08,
    representationSwitchBonus: 0.08,
    farSwitchPenalty: 0.14,

    // Far switches require a reasonably stable concept state.
    minimumConceptMasteryForFarSwitch: 0.65,
    maxSameConceptStreak: 2,
  },

  guidance: {
    novicePriorKnowledgeMax: 0.40,
    noviceGuidanceLevel: 0.85,
    intermediateGuidanceLevel: 0.50,
    expertGuidanceLevel: 0.15,
    fadeRate: 0.12,
    highLoadGuidanceBonus: 0.10,
  },

  transfer: {
    nearWeight: 0.55,
    mediumWeight: 0.30,
    farWeight: 0.15,
    noveltyPenalty: 0.12,
    prerequisiteSafetyThreshold: 0.60,
  },

  personalization: {
    priorStrength: 24,
    maxInfluence: 0.20,
    minEvidenceForStrongInfluence: 35,
    anomalyDampening: 0.40,
  },

  memory: {
    targetRetrievability: 0.86,
    initialStabilityDays: 1.0,
    minimumStabilityDays: 0.05,
    maximumStabilityDays: 3650,

    failureStabilityMultiplier: 0.55,
    successGrowthBase: 1.20,
    successGrowthConfidenceBonus: 0.08,
    delayedReviewBonus: 0.15,
    hintAssistedMultiplier: 0.75,
  },
};

export const CAESAR_VERSION = "0.2.0";
export const CAESAR_POLICY_VERSION = "0.2.0-evidence-informed-provisional";
