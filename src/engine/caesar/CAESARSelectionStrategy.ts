import { QuestionRepository } from "../../data/QuestionRepository";
import { AttemptRepository } from "../../data/AttemptRepository";
import { Question } from "../../types/question";
import {
  QuestionSelectionStrategy,
  QuestionSelectionResult,
} from "../selection/QuestionSelectionStrategy";
import {
  SelectionContext,
} from "../../types/attempt";
import {
  CAESARMathematicalScheduler,
} from "./scheduler/CAESARMathematicalScheduler";
import {
  DEFAULT_CAESAR_COEFFICIENTS,
} from "./config";
import {
  PowerLawMemoryModel,
} from "./memory/PowerLawMemoryModel";
import {
  buildCAESARState,
} from "./PracticeEngineStateBuilder";
import {
  toCAESARQuestion,
} from "./PracticeEngineQuestionAdapter";

export class CAESARSelectionStrategy
  implements QuestionSelectionStrategy
{
  readonly id =
    "caesar-v0.2";

  private readonly scheduler: CAESARMathematicalScheduler;

  constructor(
    private readonly repository: QuestionRepository,
    private readonly attempts: AttemptRepository,
  ) {
    const memory =
      new PowerLawMemoryModel(
        DEFAULT_CAESAR_COEFFICIENTS,
      );

    this.scheduler =
      new CAESARMathematicalScheduler(
        memory,
      );
  }

  async selectNextQuestion(
    context: SelectionContext,
    candidates: Question[],
  ): Promise<QuestionSelectionResult | null> {
    if (!candidates.length) {
      return null;
    }

    const candidateIds =
      new Set(
        context.availableQuestionIds,
      );

    const usable =
      candidates.filter(
        (question) =>
          candidateIds.has(
            question.id,
          ) &&
          question.status !==
            "archived" &&
          question.status !==
            "confirmed-duplicate",
      );

    if (!usable.length) {
      return null;
    }

    const built =
      await buildCAESARState(
        this.attempts,
        this.repository
          .getBank()
          .questions,
        context.sessionId,
        "adaptive",
      );

    built.session.recentQuestionIds =
      context.recentQuestionIds;

    built.session.recentConceptIds =
      context.recentQuestionIds.flatMap(
        (id) =>
          this.repository
            .getQuestion(id)
            ?.knowledgeConcepts ??
          [],
      );

    const decision =
      this.scheduler.chooseNext({
        learnerState:
          built.learnerState,
        availableQuestions:
          usable.map(
            toCAESARQuestion,
          ),
        session:
          built.session,
        now: Date.now(),
        mode: "adaptive",
      });

    if (!decision) {
      return null;
    }

    const factors = [
      `phase:${decision.phase}`,
      `objective:${decision.objective}`,
      `intervention:${decision.intervention}`,
      `utility:${decision.score.totalUtility.toFixed(3)}`,
      `memory:${decision.score.memoryNeed.toFixed(2)}`,
      `concept:${decision.score.conceptWeakness.toFixed(2)}`,
      `procedure:${decision.score.proceduralWeakness.toFixed(2)}`,
      `transfer:${decision.score.transferNeed.toFixed(2)}`,
      `error:${decision.score.errorRepair.toFixed(2)}`,
      `difficulty-fit:${decision.score.difficultyFit.toFixed(2)}`,
      `load-risk:${decision.score.loadRisk.toFixed(2)}`,
      decision.reason,
    ];

    return {
      questionId:
        decision.questionId,
      strategy:
        this.id,
      factors,
    };
  }
}
