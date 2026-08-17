import { QuestionRepository, QuestionQuery } from '../../data/QuestionRepository';
import { Question } from '../../types/question';
import { PracticeFilters } from '../../types/attempt';

export class QuestionCandidateGenerator {
	constructor(private readonly repository: QuestionRepository) {}

	getCandidates(filters: PracticeFilters | undefined, excludeIds: string[] = []): Question[] {
		const types = filters?.types;

		const query: QuestionQuery = {
			...filters,
			type: types?.length === 1 ? types[0] : undefined,
			excludeIds: [...(filters?.excludeIds ?? []), ...excludeIds],
			statuses: ['active'],
		};

		const all = this.repository.queryQuestions(query);

		if (types && types.length > 1) {
			return all.filter((q) => types.includes(q.type));
		}

		return all;
	}

	byIds(ids: string[]): Question[] {
		const set = new Set(ids);
		return this.repository.getBank().questions.filter((q) => set.has(q.id));
	}
}
