import { AttemptRepository } from "../../data/AttemptRepository";
import { AttemptEvent } from "../../types/attempt";
import { Question } from "../../types/question";
import {
  CAESARLearnerState,
  CognitiveSessionState,
  ErrorType,
  PracticeMode,
} from "./types";
import { DEFAULT_CAESAR_COEFFICIENTS } from "./config";
import { PowerLawMemoryModel } from "./memory/PowerLawMemoryModel";
import { applyAttempt, createEmptyLearnerState } from "./evidence/StateUpdate";
import {
  clamp,
  mean,
} from "./math";

function toRepresentationType(
  value: string | undefined,
): import("./types").RepresentationType | undefined {
  if (!value) return undefined;

  const allowed: ReadonlySet<import("./types").RepresentationType> =
    new Set([
      "verbal",
      "symbolic",
      "numerical",
      "diagram",
      "graph",
      "equation",
      "data",
      "physical-scenario",
      "code",
      "mixed",
      "unknown",
    ]);

  return allowed.has(
    value as import("./types").RepresentationType,
  )
    ? (value as import("./types").RepresentationType)
    : "unknown";
}

function inferErrorType(
  event: AttemptEvent,
  question: Question,
): ErrorType | undefined {
  if (event.result === "correct") {
    return undefined;
  }

  // Do not pretend to know the exact error type when the current plugin
  // does not collect it. Use only conservative structural inference.
  if (event.errorType) {
    return event.errorType as ErrorType;
  }

  if (
    question.questionFamily === "diagnosis" ||
    question.questionFamily === "troubleshooting" ||
    question.questionFamily === "design-decision"
  ) {
    return "method-selection";
  }

  if (
    question.questionFamily === "calculation" ||
    question.questionFamily === "procedure"
  ) {
    return "procedure-execution";
  }

  if (
    question.questionFamily === "conceptual" ||
    question.questionFamily === "comparison" ||
    question.questionFamily === "interpretation"
  ) {
    return "misconception";
  }

  return "unknown";
}

function toCoreAttempt(
  event: AttemptEvent,
  question: Question,
): import("./types").AttemptEvent {
  const timestamp =
    Date.parse(event.timestamp);

  return {
    id: event.id,
    questionId: event.questionId,
    questionVersion: question.version,
    sessionId: event.sessionId,
    timestamp: Number.isFinite(timestamp)
      ? timestamp
      : Date.now(),
    response: event.response,
    correctness:
      event.result === "skipped"
        ? "unanswered"
        : event.result,
    score: event.score,
    confidence:
      event.confidence == null
        ? undefined
        : (clamp(
            event.confidence,
            1,
            5,
          ) as 1 | 2 | 3 | 4 | 5),
    responseTimeMs:
      event.timeSpentMs,
    hintsUsed:
      event.hintsUsed ?? 0,
    highestHintLevel:
      event.hintLevelReached,
    answerRevealed:
      event.answerRevealed === true,
    errorType:
      inferErrorType(
        event,
        question,
      ),
    conceptIds:
      question.knowledgeConcepts ?? [],
    questionType:
      question.type,
    questionFamily:
      question.questionFamily,
    cognitiveLevel:
      question.cognitiveLevel,
    difficulty:
      question.difficulty,
    representationType:
      toRepresentationType(event.representationType),
    schemaVersion: 1,
  };
}

export interface BuiltCAESARState {
  learnerState: CAESARLearnerState;
  session: CognitiveSessionState;
}

export async function buildCAESARState(
  attempts: AttemptRepository,
  questions: Question[],
  sessionId: string,
  mode: PracticeMode = "adaptive",
): Promise<BuiltCAESARState> {
  const events =
    await attempts.listAttempts();

  const byId = new Map(
    questions.map((q) => [q.id, q]),
  );

  const memory =
    new PowerLawMemoryModel(
      DEFAULT_CAESAR_COEFFICIENTS,
    );

  const learnerId =
    "local-vault-learner";

  const state =
    createEmptyLearnerState(
      learnerId,
      Date.now(),
    );

  const ordered =
    [...events].sort(
      (a, b) =>
        a.timestamp.localeCompare(
          b.timestamp,
        ),
    );

  for (const event of ordered) {
    const question =
      byId.get(event.questionId);

    if (!question) continue;

    const core =
      toCoreAttempt(
        event,
        question,
      );

    applyAttempt(
      state,
      core,
      question.difficulty,
      memory,
      DEFAULT_CAESAR_COEFFICIENTS,
    );
  }

  const sessionEvents =
    ordered.filter(
      (event) =>
        event.sessionId === sessionId,
    );

  const recent =
    sessionEvents.slice(-20);

  const recentQuestionIds =
    recent.map(
      (event) => event.questionId,
    );

  const recentConceptIds =
    recent.flatMap((event) => {
      const q =
        byId.get(event.questionId);
      return q?.knowledgeConcepts ?? [];
    });

  const responseTimes =
    recent
      .map(
        (event) =>
          event.timeSpentMs,
      )
      .filter(
        (value): value is number =>
          typeof value ===
            "number" &&
          Number.isFinite(value) &&
          value >= 0,
      );

  const previousTimes =
    recent
      .slice(0, -4)
      .map(
        (event) =>
          event.timeSpentMs,
      )
      .filter(
        (value): value is number =>
          typeof value ===
            "number" &&
          Number.isFinite(value) &&
          value >= 0,
      );

  const recentTimes =
    recent
      .slice(-4)
      .map(
        (event) =>
          event.timeSpentMs,
      )
      .filter(
        (value): value is number =>
          typeof value ===
            "number" &&
          Number.isFinite(value) &&
          value >= 0,
      );

  let fatigueEstimate = 0;

  const previousMean =
    mean(previousTimes);
  const recentMean =
    mean(recentTimes);

  if (
    previousMean != null &&
    recentMean != null &&
    previousMean > 0
  ) {
    fatigueEstimate =
      clamp(
        recentMean /
          previousMean -
          1,
      );
  }

  return {
    learnerState: state,
    session: {
      sessionId,
      startedAt:
        sessionEvents.length > 0
          ? Date.parse(
              sessionEvents[0]
                ?.timestamp ??
                new Date().toISOString(),
            )
          : Date.now(),
      attemptCount:
        sessionEvents.length,
      recentQuestionIds,
      recentConceptIds:
        [...new Set(
          recentConceptIds,
        )],
      recentDifficulty:
        recent
          .map((event) => byId.get(event.questionId)?.difficulty)
          .filter(
            (value): value is 1 | 2 | 3 | 4 | 5 =>
              value === 1 ||
              value === 2 ||
              value === 3 ||
              value === 4 ||
              value === 5,
          ),
      recentResponseTimesMs:
        responseTimes,
      recentHintLevels:
        recent.map(
          (event) =>
            event.hintLevelReached ??
            0,
        ),
      fatigueEstimate,
      mode,
    },
  };
}

export function toCoreAttemptForLiveUpdate(
  event: AttemptEvent,
  question: Question,
): import("./types").AttemptEvent {
  return toCoreAttempt(
    event,
    question,
  );
}
