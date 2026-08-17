import {
  LearningDecision,
  LearningDecisionContext,
  LearningIntervention,
  LearningObjective,
  QuestionDescriptor,
} from "../types";
import {
  CAESARCoefficients,
  CAESAR_POLICY_VERSION,
  CAESAR_VERSION,
  DEFAULT_CAESAR_COEFFICIENTS,
} from "../config";
import { MemoryModel } from "../memory/MemoryModel";
import { FeatureExtractor } from "../features/FeatureExtractor";
import { CognitiveStateModel } from "../cognitive/CognitiveStateModel";
import { InterleavingModel } from "../interleaving/InterleavingModel";
import { UtilityModel } from "../scoring/UtilityModel";
import { PersonalizationModel } from "../personalization/PersonalizationModel";
import { makeId, clamp } from "../math";

export interface MathematicalSchedulerConfig {
  coefficients?: CAESARCoefficients;
  caesarVersion?: string;
  policyVersion?: string;
  targetRetrievability?: number;
}

export class CAESARMathematicalScheduler {
  private readonly coefficients: CAESARCoefficients;
  private readonly featureExtractor: FeatureExtractor;
  private readonly cognitiveState: CognitiveStateModel;
  private readonly interleaving: InterleavingModel;
  private readonly utility: UtilityModel;
  private readonly personalization: PersonalizationModel;

  constructor(
    private readonly memoryModel: MemoryModel,
    config: MathematicalSchedulerConfig = {}
  ) {
    this.coefficients =
      config.coefficients ??
      DEFAULT_CAESAR_COEFFICIENTS;

    this.featureExtractor =
      new FeatureExtractor(
        this.coefficients
      );

    this.cognitiveState =
      new CognitiveStateModel(
        this.coefficients
      );

    this.interleaving =
      new InterleavingModel(
        this.coefficients
      );

    this.utility =
      new UtilityModel(
        this.coefficients
      );

    this.personalization =
      new PersonalizationModel(
        this.coefficients
      );
  }

  chooseNext(
    context: LearningDecisionContext
  ): LearningDecision | null {
    if (
      context.availableQuestions.length ===
      0
    ) {
      return null;
    }

    if (
      context.mode === "random"
    ) {
      return this.randomDecision(
        context
      );
    }

    const cognitive =
      this.cognitiveState.infer(
        context.learnerState,
        context.session
      );

    const objective =
      this.applyGoalOverride(
        cognitive.objective,
        context.userGoal
      );

    const ranked =
      context.availableQuestions
        .filter(
          (question) =>
            this.isEligible(
              question,
              context
            )
        )
        .map(
          (question) => {
            const baseFeatures =
              this.featureExtractor.extract(
                question,
                {
                  learnerState:
                    context.learnerState,
                  session:
                    context.session,
                  now: context.now,
                }
              );

            const interleave =
              this.interleaving.score(
                question,
                context.session,
                context.learnerState
              );

            const features = {
              ...baseFeatures,
              familyNovelty:
                clamp(
                  baseFeatures.familyNovelty *
                    0.70 +
                  interleave *
                    0.30
                ),
            };

            const intervention =
              this.chooseIntervention(
                objective,
                features
              );

            const score =
              this.utility.score(
                features,
                objective,
                intervention
              );

            const personalized =
              this.applyPersonalization(
                score,
                context
              );

            return {
              question,
              intervention,
              score:
                personalized,
            };
          }
        )
        .sort(
          (a, b) =>
            b.score.totalUtility -
            a.score.totalUtility
        );

    if (!ranked.length) {
      return null;
    }

    const selected =
      this.selectCandidate(
        ranked
      );

    if (!selected) {
      return null;
    }


    const confidence =
      this.decisionConfidence(
        ranked
      );

    return {
      decisionId:
        makeId(
          "caesar-math"
        ),
      questionId:
        selected.question.id,
      phase:
        cognitive.phase,
      objective,
      intervention:
        selected.intervention,
      score:
        selected.score,
      reason:
        this.buildReason(
          cognitive.phase,
          objective,
          selected.question,
          selected.score
        ),
      confidence,
      caesarVersion:
        CAESAR_VERSION,
      policyVersion:
        CAESAR_POLICY_VERSION,
      memoryModelVersion:
        this.memoryModel.version,
    };
  }

  private isEligible(
    question: QuestionDescriptor,
    context: LearningDecisionContext
  ): boolean {
    if (
      context.mode === "exam" &&
      question.verified === false
    ) {
      return false;
    }

    const recent =
      context.session
        .recentQuestionIds;

    if (
      recent
        .slice(
          -1
        )
        .includes(
          question.id
        )
    ) {
      return false;
    }

    if (
      context.timeBudgetMs != null &&
      (question.estimatedTimeMs ??
        90_000) >
        context.timeBudgetMs
    ) {
      return false;
    }

    return true;
  }

  private chooseIntervention(
    objective: LearningObjective,
    features: ReturnType<
      FeatureExtractor["extract"]
    >
  ): LearningIntervention {
    switch (objective) {
      case "encode":
        return "worked-example";

      case "retrieve":
      case "repair-memory":
      case "maintain":
        return "retrieval";

      case "repair-concept":
        return features.contrastValue >=
          0.65
          ? "contrast"
          : "conceptual-explanation";

      case "repair-procedure":
        return features.proceduralWeakness >=
          0.60
          ? "completion-problem"
          : "independent-problem";

      case "discriminate":
        return "contrast";

      case "switch-representation":
        return "representation-switch";

      case "transfer":
        return "transfer";

      case "calibrate":
        return "retrieval";

      default:
        return "retrieval";
    }
  }

  private applyPersonalization(
    score: ReturnType<
      UtilityModel["score"]
    >,
    context: LearningDecisionContext
  ) {
    const personalWeight =
      this.personalization.influence(
        context.learnerState
      );

    if (
      personalWeight <= 0
    ) {
      return score;
    }

    const difficultyModifier =
      this.personalization
        .getDifficultyModifier(
          context.learnerState
        );

    const personalCalibration =
      this.personalization
        .getCalibrationNeed(
          context.learnerState
        );

    return {
      ...score,
      difficultyFit:
        clamp(
          score.difficultyFit +
            difficultyModifier *
              personalWeight
        ),
      calibrationNeed:
        clamp(
          score.calibrationNeed +
            personalCalibration *
              personalWeight
        ),
      totalUtility:
        score.totalUtility +
        difficultyModifier *
          personalWeight *
          0.05 +
        personalCalibration *
          personalWeight *
          this.coefficients
            .utility
            .calibrationNeed,
    };
  }

  private selectCandidate(
    ranked: Array<{
      question: QuestionDescriptor;
      intervention: LearningIntervention;
      score: ReturnType<UtilityModel["score"]>;
    }>
  ): {
    question: QuestionDescriptor;
    intervention: LearningIntervention;
    score: ReturnType<UtilityModel["score"]>;
  } | null {
    const best = ranked[0];
    if (!best) return null;

    const tied = ranked.filter(
      (item) =>
        Math.abs(
          item.score.totalUtility -
            best.score.totalUtility
        ) < 0.025
    );

    if (tied.length <= 1) {
      return best;
    }

    return (
      tied[
        Math.floor(
          Math.random() * tied.length
        )
      ] ?? best
    );
  }

  private decisionConfidence(
    ranked: Array<{
      score: ReturnType<
        UtilityModel["score"]
      >;
    }>
  ): number {
    if (
      ranked.length === 1
    ) {
      return 0.65;
    }

    const first = ranked[0];
    const second = ranked[1];
    if (!first || !second) {
      return 0.65;
    }

    const margin =
      first.score.totalUtility -
      second.score.totalUtility;

    return clamp(
      0.50 +
        margin
      );
  }

  private buildReason(
    phase: string,
    objective: LearningObjective,
    question: QuestionDescriptor,
    score: ReturnType<
      UtilityModel["score"]
    >
  ): string {
    const reasons: string[] =
      [];

    if (
      score.memoryNeed >=
      0.60
    ) {
      reasons.push(
        "memory need is elevated"
      );
    }

    if (
      score.errorRepair >=
      0.50
    ) {
      reasons.push(
        "recent error evidence supports repair"
      );
    }

    if (
      score.transferNeed >=
      0.60
    ) {
      reasons.push(
        "transfer need is elevated"
      );
    }

    if (
      score.contrastValue >=
      0.60
    ) {
      reasons.push(
        "the item supports useful discrimination"
      );
    }

    if (
      score.prerequisiteNeed >=
      0.50
    ) {
      reasons.push(
        "a prerequisite appears unstable"
      );
    }

    if (
      !reasons.length
    ) {
      reasons.push(
        "it has the highest balanced utility among eligible candidates"
      );
    }

    return [
      `Phase=${phase}`,
      `Objective=${objective}`,
      `Question=${question.id}`,
      reasons.join("; "),
    ].join(". ");
  }

  private applyGoalOverride(
    objective: LearningObjective,
    goal:
      | LearningDecisionContext["userGoal"]
  ): LearningObjective {
    switch (goal) {
      case "learn-new":
        return "encode";
      case "retain":
        return "retrieve";
      case "understand":
        return "repair-concept";
      case "problem-solving":
        return "repair-procedure";
      case "transfer":
        return "transfer";
      case "maintenance":
        return "maintain";
      case "weak-areas":
        return "repair-concept";
      default:
        return objective;
    }
  }

  private randomDecision(
    context: LearningDecisionContext
  ): LearningDecision | null {
    const question =
      context.availableQuestions[
        Math.floor(
          Math.random() *
            context.availableQuestions.length
        )
      ];

    if (!question) return null;

    const features =
      this.featureExtractor.extract(
        question,
        {
          learnerState:
            context.learnerState,
          session:
            context.session,
          now:
            context.now,
        }
      );

    const score =
      this.utility.score(
        features,
        "explore",
        "retrieval"
      );

    return {
      decisionId:
        makeId(
          "caesar-random"
        ),
      questionId:
        question.id,
      phase:
        "stabilization",
      objective:
        "explore",
      intervention:
        "retrieval",
      score,
      reason:
        "Random mode is active; CAESAR is recording evidence without adaptive selection.",
      confidence: 0,
      caesarVersion:
        CAESAR_VERSION,
      policyVersion:
        CAESAR_POLICY_VERSION,
      memoryModelVersion:
        this.memoryModel.version,
    };
  }
}
