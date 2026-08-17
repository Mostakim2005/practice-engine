import { Question } from '../../types/question';
import { AttemptResult } from '../../types/attempt';

export interface EvaluationResult {
	result: AttemptResult;
	correctness?: boolean;
	score?: number;
}

export interface ResponseEvaluator {
	evaluate(question: Question, response: unknown): EvaluationResult;
}

export class DefaultResponseEvaluator implements ResponseEvaluator {
	evaluate(question: Question, response: unknown): EvaluationResult {
		if (question.type === 'mcq') {
			const answer = typeof response === 'string' ? response : '';
			const expected = question.correctAnswer?.[0] ?? '';
			return {
				result: answer === expected ? 'correct' : 'incorrect',
				correctness: answer === expected,
				score: answer === expected ? 1 : 0,
			};
		}

		if (question.type === 'multiple-select') {
			const actual = Array.isArray(response) ? response.map(String).sort() : [];
			const expected = [...(question.correctAnswer ?? [])].sort();
			const same = actual.length === expected.length && actual.every((x, i) => x === expected[i]);
			return {
				result: same ? 'correct' : 'incorrect',
				correctness: same,
				score: same ? 1 : 0,
			};
		}

		// Open-ended responses are intentionally self-assessed in this phase.
		return { result: 'partial', score: undefined };
	}
}
