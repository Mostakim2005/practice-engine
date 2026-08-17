import { Question } from '../../types/question';
import { QuestionSelectionResult, SelectionContext } from '../../types/attempt';

export type { QuestionSelectionResult } from '../../types/attempt';

export interface QuestionSelectionStrategy {
	selectNextQuestion(
		context: SelectionContext,
		candidates: Question[],
	): Promise<QuestionSelectionResult | null>;
}

export class BasicRandomSelectionStrategy implements QuestionSelectionStrategy {
	async selectNextQuestion(
		context: SelectionContext,
		candidates: Question[],
	): Promise<QuestionSelectionResult | null> {
		const recent = new Set(context.recentQuestionIds);
		const eligible = candidates.filter((q) => !recent.has(q.id));
		const pool = eligible.length ? eligible : candidates;
		if (!pool.length) return null;
		const question = pool[Math.floor(Math.random() * pool.length)];
		if (!question) return null;
		return {
			questionId: question.id,
			strategy: 'basic-random',
			factors: ['selected from eligible practice set'],
		};
	}
}
