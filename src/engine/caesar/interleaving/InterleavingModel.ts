import {
  CognitiveSessionState,
  QuestionDescriptor,
  CAESARLearnerState,
} from "../types";
import { CAESARCoefficients } from "../config";
import { clamp } from "../math";

export class InterleavingModel {
  constructor(
    private readonly coefficients: CAESARCoefficients
  ) {}

  score(
    question: QuestionDescriptor,
    session: CognitiveSessionState,
    state: CAESARLearnerState
  ): number {
    if (!session.recentQuestionIds.length) {
      return 0.50;
    }

    const sameConcept =
      question.conceptIds.some(
        (id) =>
          session.recentConceptIds.includes(
            id
          )
      );

    if (sameConcept) {
      return clamp(
        0.5 -
          this.coefficients.interleaving
            .sameConceptPenalty
      );
    }

    const nearConcept =
      (question.relatedConceptIds ??
        []).some((id) =>
        session.recentConceptIds.includes(
          id
        )
      );

    const recentQuestions =
      session.recentQuestionIds
        .map(
          (id) =>
            Object.values(
              state.questionStates
            ).find(
              (q) =>
                q.questionId === id
            )
        )
        .filter(Boolean);

    const familySwitch =
      recentQuestions.length > 0
        ? 0.10
        : 0;

    const representationSwitch =
      question.representationType
        ? 0.10
        : 0;

    let value = 0.50;

    if (nearConcept) {
      value += this.coefficients
        .interleaving
        .nearConceptBonus;
    }

    if (
      question.contrastsWith
        ?.length
    ) {
      value += this.coefficients
        .interleaving
        .contrastBonus;
    }

    value +=
      familySwitch *
      this.coefficients
        .interleaving
        .familySwitchBonus;

    value +=
      representationSwitch *
      this.coefficients
        .interleaving
        .representationSwitchBonus;

    if (
      !nearConcept &&
      !question.contrastsWith?.length
    ) {
      value -= this.coefficients
        .interleaving
        .farSwitchPenalty;
    }

    return clamp(value);
  }
}
