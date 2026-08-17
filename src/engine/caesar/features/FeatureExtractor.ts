import {
  CAESARLearnerState,
  CandidateFeatures,
  CandidateSource,
  CognitiveSessionState,
  QuestionDescriptor,
} from "../types";
import { CAESARCoefficients } from "../config";
import {
  clamp,
  daysBetween,
  gaussianFit,
  mean,
} from "../math";

export interface FeatureContext {
  learnerState: CAESARLearnerState;
  session: CognitiveSessionState;
  now: number;
}

export class FeatureExtractor {
  constructor(
    private readonly coefficients: CAESARCoefficients
  ) {}

  extract(
    question: QuestionDescriptor,
    context: FeatureContext
  ): CandidateFeatures {
    const {
      learnerState,
      session,
      now,
    } = context;

    const qState =
      learnerState.questionStates[
        question.id
      ];

    const conceptStates =
      question.conceptIds
        .map(
          (id) =>
            learnerState.conceptStates[id]
        )
        .filter(Boolean);

    const conceptual =
      mean(
        conceptStates.map(
          (s) =>
            s!.mastery.conceptual
        )
      ) ?? 0.5;

    const procedural =
      mean(
        conceptStates.map(
          (s) =>
            s!.mastery.procedural
        )
      ) ?? 0.5;

    const transfer =
      mean(
        conceptStates.map(
          (s) =>
            s!.mastery.transfer
        )
      ) ?? 0.5;

    const conceptWeakness =
      clamp(1 - conceptual);

    const proceduralWeakness =
      clamp(1 - procedural);

    const transferNeed =
      clamp(1 - transfer);

    const memoryNeed = qState
      ? clamp(
          1 -
            (qState.memory
              .retrievability ?? 1)
        )
      : 0.40;

    const errorRepair =
      this.errorRepair(
        conceptStates
      );

    const prerequisiteNeed =
      this.prerequisiteNeed(
        question,
        learnerState
      );

    const calibrationNeed =
      this.calibrationNeed(
        conceptStates
      );

    const contrastValue =
      question.contrastsWith?.length
        ? 0.85
        : 0.10;

    const representationNovelty =
      this.representationNovelty(
        question,
        session,
        learnerState
      );

    const familyNovelty =
      session.recentQuestionIds
        .map(
          (id) =>
            learnerState.questionStates[
              id
            ]
        )
        .length === 0
        ? 0.50
        : this.recentFamilyNovelty(
            question,
            session
          );

    const interleavingDistance =
      this.interleavingDistance(
        question,
        session,
        learnerState
      );

    const effectiveDifficulty =
      clamp(
        (question.difficulty - 1) / 4 +
          this.coefficients
            .difficulty
            .representationLoadWeight *
            (1 -
              representationNovelty) +
          this.coefficients
            .difficulty
            .interleavingLoadWeight *
            interleavingDistance
      );

    const difficultyFit =
      gaussianFit(
        effectiveDifficulty,
        this.coefficients
          .difficulty
          .targetEffectiveDifficulty,
        this.coefficients
          .difficulty
          .difficultySigma
      );

    const importance =
      clamp(
        question.importance ??
          0.50
      );

    const explorationValue =
      qState == null
        ? 0.85
        : 0.25;

    const expectedTimeMs =
      question.estimatedTimeMs ??
      this.defaultTime(
        question
      );

    const repetitionCost =
      this.repetitionCost(
        question,
        session
      );

    const fatigue =
      clamp(
        session.fatigueEstimate ??
          0
      );

    const loadRisk =
      clamp(
        effectiveDifficulty +
          fatigue * 0.35 -
          0.58
      );

    const disruptionCost =
      this.disruptionCost(
        question,
        session,
        learnerState
      );

    const sources =
      this.sources({
        memoryNeed,
        conceptWeakness,
        proceduralWeakness,
        transferNeed,
        errorRepair,
        prerequisiteNeed,
        question,
      });

    return {
      memoryNeed,
      conceptWeakness,
      proceduralWeakness,
      transferNeed,
      errorRepair,
      calibrationNeed,
      prerequisiteNeed,
      contrastValue,
      representationNovelty,
      familyNovelty,
      difficultyFit,
      importance,
      explorationValue,
      repetitionCost,
      loadRisk,
      fatigueCost:
        clamp(
          fatigue *
            effectiveDifficulty
        ),
      disruptionCost,
      effectiveDifficulty,
      expectedTimeMs,
    };
  }

  private errorRepair(
    states: Array<
      import("../types").KnowledgeComponentState | undefined
    >
  ): number {
    if (!states.length) return 0;

    return Math.max(
      ...states.map((state) => {
        if (!state) return 0;

        const counts =
          state.errors.counts;

        const weighted =
          (counts.misconception ?? 0) *
            1.0 +
          (counts["method-selection"] ??
            0) *
            0.9 +
          (counts["prerequisite-gap"] ??
            0) *
            0.9 +
          (counts["procedure-execution"] ??
            0) *
            0.7 +
          (counts.forgetting ?? 0) *
            0.45;

        return clamp(
          weighted / 4
        );
      })
    );
  }

  private prerequisiteNeed(
    question: QuestionDescriptor,
    state: CAESARLearnerState
  ): number {
    if (!question.prerequisites?.length) {
      return 0;
    }

    const values =
      question.prerequisites.map(
        (id) => {
          const concept =
            state.conceptStates[id];

          if (
            !concept ||
            concept.mastery
              .conceptual == null
          ) {
            return 0.75;
          }

          return clamp(
            1 -
              concept.mastery
                .conceptual
          );
        }
      );

    return Math.max(
      ...values
    );
  }

  private calibrationNeed(
    states: Array<
      import("../types").KnowledgeComponentState | undefined
    >
  ): number {
    if (!states.length) return 0.20;

    return Math.max(
      ...states.map((state) => {
        if (!state) return 0.20;

        const m =
          state.metacognition;

        if (
          m.attemptsWithConfidence <
          3
        ) {
          return 0.20;
        }

        return clamp(
          1 -
            (m.calibrationScore ??
              0.5)
        );
      })
    );
  }

  private representationNovelty(
    question: QuestionDescriptor,
    session: CognitiveSessionState,
    state: CAESARLearnerState
  ): number {
    if (
      !question.representationType ||
      session.recentQuestionIds
        .length === 0
    ) {
      return 0.50;
    }

    const recentlyUsed =
      session.recentQuestionIds.some(
        (id) => {
          const qState =
            state.questionStates[id];

          return Boolean(
            qState
          );
        }
      );

    return recentlyUsed
      ? question.representationType ===
        "mixed"
        ? 0.75
        : 0.55
      : 0.80;
  }

  private recentFamilyNovelty(
    question: QuestionDescriptor,
    session: CognitiveSessionState
  ): number {
    const overlap =
      session.recentQuestionIds
        .length > 0 &&
      session.recentConceptIds
        .some((conceptId) =>
          question.conceptIds.includes(
            conceptId
          )
        );

    return overlap
      ? 0.25
      : 0.75;
  }

  private interleavingDistance(
    question: QuestionDescriptor,
    session: CognitiveSessionState,
    state: CAESARLearnerState
  ): number {
    if (
      !session.recentConceptIds.length
    ) {
      return 0;
    }

    const related =
      question.relatedConceptIds ??
      [];

    const same =
      question.conceptIds.some(
        (id) =>
          session.recentConceptIds.includes(
            id
          )
      );

    if (same) return 0;

    const near =
      related.some((id) =>
        session.recentConceptIds.includes(
          id
        )
      );

    if (near) return 0.35;

    const recentQuestions =
      session.recentQuestionIds
        .map(
          (id) =>
            state.questionStates[id]
        )
        .filter(Boolean);

    return recentQuestions.length
      ? 0.80
      : 0.50;
  }

  private repetitionCost(
    question: QuestionDescriptor,
    session: CognitiveSessionState
  ): number {
    const recent =
      session.recentQuestionIds;

    const sameQuestion =
      recent.includes(
        question.id
      );

    const sameConcept =
      session.recentConceptIds.some(
        (id) =>
          question.conceptIds.includes(id)
      );

    return clamp(
      (sameQuestion ? 0.90 : 0) +
        (sameConcept ? 0.20 : 0)
    );
  }

  private disruptionCost(
    question: QuestionDescriptor,
    session: CognitiveSessionState,
    state: CAESARLearnerState
  ): number {
    if (
      session.recentQuestionIds
        .length === 0
    ) {
      return 0.05;
    }

    const sameConcept =
      question.conceptIds.some(
        (id) =>
          session.recentConceptIds.includes(
            id
          )
      );

    if (sameConcept) {
      return 0.05;
    }

    const recentQuestions =
      session.recentQuestionIds
        .map(
          (id) =>
            state.questionStates[id]
        )
        .filter(Boolean);

    return recentQuestions.length
      ? 0.25
      : 0.10;
  }

  private sources(args: {
    memoryNeed: number;
    conceptWeakness: number;
    proceduralWeakness: number;
    transferNeed: number;
    errorRepair: number;
    prerequisiteNeed: number;
    question: QuestionDescriptor;
  }): CandidateSource[] {
    const sources: CandidateSource[] =
      [];

    if (!args.question.id) {
      sources.push(
        "new-learning"
      );
    }

    if (
      args.memoryNeed >=
      this.coefficients.phase
        .memoryUrgencyThreshold
    ) {
      sources.push(
        "due-review"
      );
    }

    if (
      args.conceptWeakness >=
      0.45
    ) {
      sources.push(
        "weak-concept"
      );
    }

    if (
      args.errorRepair >= 0.45
    ) {
      sources.push(
        "error-repair"
      );
    }

    if (
      args.prerequisiteNeed >=
      0.50
    ) {
      sources.push(
        "prerequisite"
      );
    }

    if (
      args.transferNeed >= 0.45
    ) {
      sources.push(
        "transfer"
      );
    }

    if (
      args.question.contrastsWith
        ?.length
    ) {
      sources.push(
        "contrast"
      );
    }

    return sources;
  }

  private defaultTime(
    question: QuestionDescriptor
  ): number {
    const base: Record<
      string,
      number
    > = {
      mcq: 45_000,
      "multiple-select": 60_000,
      "true-false": 30_000,
      written: 120_000,
      numerical: 150_000,
      matching: 75_000,
      ordering: 75_000,
      identification: 60_000,
      viva: 120_000,
      "multi-part": 210_000,
    };

    return Math.max(
      20_000,
      Math.round(
        (base[question.type] ??
          90_000) *
          (1 +
            (question.difficulty -
              3) *
              0.15)
      )
    );
  }
}
