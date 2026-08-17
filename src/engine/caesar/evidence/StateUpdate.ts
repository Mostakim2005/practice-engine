import {
  AttemptEvent,
  CAESARLearnerState,
  ErrorState,
  KnowledgeComponentState,
  MasteryState,
  MetacognitiveState,
  QuestionLearningState,
} from "../types";
import { CAESARCoefficients } from "../config";
import { MemoryModel, attemptToOutcome } from "../memory/MemoryModel";
import { clamp } from "../math";

function emptyErrors(): ErrorState {
  return {
    counts: {},
    misconceptionActive: false,
    misconceptionEvidenceCount: 0,
    prerequisiteGapEvidenceCount: 0,
  };
}

function emptyMastery(): MasteryState {
  return {
    conceptual: null,
    procedural: null,
    transfer: null,
    evidenceCount: 0,
  };
}

function emptyMetacognition(): MetacognitiveState {
  return {
    attemptsWithConfidence: 0,
    meanConfidence: undefined,
    calibrationScore: undefined,
    correctHighConfidence: 0,
    correctLowConfidence: 0,
    incorrectHighConfidence: 0,
    incorrectLowConfidence: 0,
  };
}

function updateMastery(
  previous: number | null,
  outcome: number,
  learningRate: number
): number {
  if (previous == null) return outcome;
  return (
    previous +
    learningRate *
      (outcome - previous)
  );
}

function outcomeValue(
  event: AttemptEvent
): number {
  switch (
    event.correctness
  ) {
    case "correct":
      return 1;
    case "partial":
      return clamp(
        event.score ?? 0.5
      );
    default:
      return 0;
  }
}

export function createEmptyLearnerState(
  learnerId: string,
  now: number
): CAESARLearnerState {
  return {
    learnerId,
    schemaVersion: 1,
    questionStates: {},
    conceptStates: {},
    sessions: {},
    recentAttemptIds: [],
    updatedAt: now,
  };
}

export function applyAttempt(
  state: CAESARLearnerState,
  event: AttemptEvent,
  questionDifficulty: number,
  memoryModel: MemoryModel,
  coefficients: CAESARCoefficients
): CAESARLearnerState {
  const next: CAESARLearnerState =
    structuredClone(state);

  const existingQuestion =
    next.questionStates[
      event.questionId
    ] ??
    ({
      questionId:
        event.questionId,
      attemptCount: 0,
      totalCorrect: 0,
      totalIncorrect: 0,
      totalPartial: 0,
      hintsUsedTotal: 0,
      memory:
        memoryModel.initialize(
          questionDifficulty,
          event.timestamp
        ),
      errors:
        emptyErrors(),
      recentAttemptIds: [],
    } satisfies QuestionLearningState);

  const memory =
    memoryModel.update(
      existingQuestion.memory,
      attemptToOutcome(
        event,
        existingQuestion.memory
          .lastReviewAt
      ),
      event.timestamp
    );

  const nextQuestion: QuestionLearningState =
    {
      ...existingQuestion,
      attemptCount:
        existingQuestion.attemptCount +
        1,
      lastAttemptAt:
        event.timestamp,
      lastResult:
        event.correctness,
      lastConfidence:
        event.confidence,
      lastResponseTimeMs:
        event.responseTimeMs,
      totalCorrect:
        existingQuestion.totalCorrect +
        (event.correctness ===
        "correct"
          ? 1
          : 0),
      totalIncorrect:
        existingQuestion.totalIncorrect +
        (event.correctness ===
        "incorrect"
          ? 1
          : 0),
      totalPartial:
        existingQuestion.totalPartial +
        (event.correctness ===
        "partial"
          ? 1
          : 0),
      hintsUsedTotal:
        existingQuestion.hintsUsedTotal +
        event.hintsUsed,
      memory,
      recentAttemptIds: [
        ...existingQuestion.recentAttemptIds.slice(
          -19
        ),
        event.id,
      ],
    };

  next.questionStates[
    event.questionId
  ] = nextQuestion;

  for (
    const conceptId of
    event.conceptIds
  ) {
    const existingConcept =
      next.conceptStates[
        conceptId
      ] ??
      ({
        conceptId,
        memory:
          memoryModel.initialize(
            questionDifficulty,
            event.timestamp
          ),
        mastery:
          emptyMastery(),
        metacognition:
          emptyMetacognition(),
        errors:
          emptyErrors(),
        practiceCount: 0,
        relatedQuestionIds: [],
      } satisfies KnowledgeComponentState);

    const conceptMemory =
      memoryModel.update(
        existingConcept.memory,
        attemptToOutcome(
          event,
          existingConcept.memory
            .lastReviewAt
        ),
        event.timestamp
      );

    const outcome =
      outcomeValue(event);

    const mastery =
      {
        ...existingConcept.mastery,
        evidenceCount:
          existingConcept.mastery
            .evidenceCount + 1,
        lastEvidenceAt:
          event.timestamp,
      };

    if (
      event.questionFamily ===
        "conceptual" ||
      event.cognitiveLevel ===
        "understanding"
    ) {
      mastery.conceptual =
        updateMastery(
          mastery.conceptual,
          outcome,
          coefficients.mastery
            .learningRate
        );
    } else if (
      event.questionFamily ===
        "calculation" ||
      event.questionFamily ===
        "procedure"
    ) {
      mastery.procedural =
        updateMastery(
          mastery.procedural,
          outcome,
          coefficients.mastery
            .learningRate
        );
    } else if (
      event.questionFamily ===
        "scenario" ||
      event.questionFamily ===
        "diagnosis" ||
      event.questionFamily ===
        "troubleshooting" ||
      event.questionFamily ===
        "reasoning"
    ) {
      mastery.transfer =
        updateMastery(
          mastery.transfer,
          outcome,
          coefficients.mastery
            .learningRate
        );
    }

    const errors = {
      ...existingConcept.errors,
    };

    if (
      event.errorType
    ) {
      errors.counts = {
        ...errors.counts,
        [event.errorType]:
          (errors.counts[
            event.errorType
          ] ?? 0) + 1,
      };

      errors.lastErrorType =
        event.errorType;
      errors.lastErrorAt =
        event.timestamp;

      if (
        event.errorType ===
        "misconception"
      ) {
        errors.misconceptionEvidenceCount += 1;

        if (
          errors.misconceptionEvidenceCount >=
          coefficients.error
            .misconceptionActivationCount
        ) {
          errors.misconceptionActive =
            true;
        }
      }

      if (
        event.errorType ===
        "prerequisite-gap"
      ) {
        errors.prerequisiteGapEvidenceCount +=
          1;
      }
    } else if (
      event.correctness ===
        "correct" &&
      event.hintsUsed === 0
    ) {
      if (
        errors.misconceptionEvidenceCount >
        0
      ) {
        errors.misconceptionEvidenceCount =
          Math.max(
            0,
            errors.misconceptionEvidenceCount -
              1
          );
      }
    }

    const metacognition =
      {
        ...existingConcept.metacognition,
      };

    if (
      event.confidence != null
    ) {
      const n =
        metacognition.attemptsWithConfidence +
        1;

      metacognition.meanConfidence =
        (
          (metacognition.meanConfidence ??
            0) *
            metacognition.attemptsWithConfidence +
          event.confidence
        ) / n;

      metacognition.attemptsWithConfidence =
        n;

      const high =
        event.confidence >=
        4;

      if (
        event.correctness ===
          "correct"
      ) {
        if (high)
          metacognition.correctHighConfidence +=
            1;
        else
          metacognition.correctLowConfidence +=
            1;
      } else {
        if (high)
          metacognition.incorrectHighConfidence +=
            1;
        else
          metacognition.incorrectLowConfidence +=
            1;
      }

      const total =
        metacognition
          .correctHighConfidence +
        metacognition
          .correctLowConfidence +
        metacognition
          .incorrectHighConfidence +
        metacognition
          .incorrectLowConfidence;

      if (
        total > 0
      ) {
        const observedAccuracy =
          (
            metacognition
              .correctHighConfidence +
            metacognition
              .correctLowConfidence
          ) / total;

        metacognition.calibrationScore =
          clamp(
            1 -
              Math.abs(
                metacognition.meanConfidence! /
                  5 -
                  observedAccuracy
              )
          );
      }
    }

    next.conceptStates[
      conceptId
    ] = {
      ...existingConcept,
      memory:
        conceptMemory,
      mastery,
      errors,
      metacognition,
      practiceCount:
        existingConcept.practiceCount +
        1,
      lastPracticedAt:
        event.timestamp,
      lastSuccessfulPracticeAt:
        event.correctness ===
        "correct"
          ? event.timestamp
          : existingConcept.lastSuccessfulPracticeAt,
      lastFailedPracticeAt:
        event.correctness ===
          "incorrect" ||
        event.correctness ===
          "partial"
          ? event.timestamp
          : existingConcept.lastFailedPracticeAt,
      relatedQuestionIds: [
        ...existingConcept.relatedQuestionIds.slice(
          -49
        ),
        event.questionId,
      ],
    };
  }

  next.recentAttemptIds =
    [
      ...next.recentAttemptIds.slice(
        -99
      ),
      event.id,
    ];

  next.updatedAt =
    event.timestamp;

  return next;
}
