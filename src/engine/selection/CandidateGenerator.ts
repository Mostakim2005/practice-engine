import { QuestionRepository } from '../../data/QuestionRepository';
import { Question } from '../../types/question';
import { PracticeFilters, SelectionContext } from '../../types/attempt';

export class QuestionCandidateGenerator {
	constructor(private readonly repository: QuestionRepository) {}

	getCandidates(filters: PracticeFilters | undefined, excludeIds: string[] = []): Question[] {
		const excluded = new Set(excludeIds);
		const bank = this.repository.getBank().questions;
		return bank.filter((q) => {
			if (excluded.has(q.id)) return false;
			if ((q.status ?? 'active') !== 'active') return false;
			if (filters?.subject && q.subject !== filters.subject) return false;
			if (filters?.topic && q.topic !== filters.topic) return false;
			if (filters?.subtopic && q.subtopic !== filters.subtopic) return false;
			if (filters?.types?.length && !filters.types.includes(q.type)) return false;
			if (filters?.difficulties?.length && !filters.difficulties.includes(q.difficulty)) return false;
			return true;
		});
	}

	byIds(ids: string[]): Question[] {
		const set = new Set(ids);
		return this.repository.getBank().questions.filter((q) => set.has(q.id));
	}
}
