import { QuestionRepository } from './QuestionRepository';
import { CognitiveLevel, QuestionFamily, QuestionType } from '../types/question';

export interface TaxonomySnapshot {
	subjects: string[];
	topics: string[];
	subtopics: string[];
	tags: string[];
	knowledgeConcepts: string[];
	applicationDomains: string[];
	types: QuestionType[];
	difficulties: number[];
	cognitiveLevels: CognitiveLevel[];
	questionFamilies: QuestionFamily[];
}

export class TaxonomyRepository {
	constructor(private readonly questions: QuestionRepository) {}

	getSnapshot(): TaxonomySnapshot {
		return this.questions.getTaxonomy();
	}
}
