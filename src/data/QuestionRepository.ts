import { App, TFile } from 'obsidian';
import {
	CognitiveLevel,
	Question,
	QuestionBank,
	QUESTION_SCHEMA_VERSION,
	QuestionFamily,
	QuestionStatus,
	QuestionType,
} from '../types/question';
import { PracticeFilters } from '../types/attempt';
import { validateQuestionBank, ValidationIssue } from '../validation/QuestionValidator';

export const QUESTION_BANK_PATH = '_Practice/Question Banks/question-bank.json';

export interface DuplicateMatch {
	incomingId: string;
	existingId: string;
	reason: 'id' | 'prompt' | 'fingerprint';
	conflict: boolean;
}

export interface ImportPreview {
	bank: QuestionBank;
	issues: ValidationIssue[];
	newQuestions: Question[];
	replaceQuestions: Question[];
	duplicates: DuplicateMatch[];
}

export interface QuestionQuery {
	subject?: string;
	topic?: string;
	subtopic?: string;
	tags?: string[];
	knowledgeConcepts?: string[];
	applicationDomains?: string[];
	type?: QuestionType;
	difficulties?: number[];
	cognitiveLevels?: CognitiveLevel[];
	questionFamilies?: QuestionFamily[];
	statuses?: QuestionStatus[];
	excludeIds?: string[];
}

const norm = (s: string): string =>
	s.toLocaleLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();

const fingerprint = (q: Question): string =>
	`${norm(q.question)}||${(q.options ?? []).map((o) => `${o.id}:${norm(o.text)}`).join('|')}||${(q.correctAnswer ?? []).slice().sort().join(',')}`;

const includesAll = (haystack: string[] | undefined, needles: string[] | undefined): boolean => {
	if (!needles?.length) return true;
	const set = new Set(haystack ?? []);
	return needles.every((value) => set.has(value));
};

export class QuestionRepository {
	private bank: QuestionBank = {
		schemaVersion: QUESTION_SCHEMA_VERSION,
		bank: { id: 'default', name: 'Practice Question Bank' },
		questions: [],
	};

	constructor(private readonly app: App) {}

	getBank(): QuestionBank {
		return structuredClone(this.bank);
	}

	getQuestion(id: string): Question | undefined {
		const q = this.bank.questions.find((item) => item.id === id);
		return q ? structuredClone(q) : undefined;
	}

	queryQuestions(query: QuestionQuery = {}): Question[] {
		const exclude = new Set(query.excludeIds ?? []);
		return this.bank.questions
			.filter((q) => {
				if (exclude.has(q.id)) return false;
				if (query.subject && q.subject !== query.subject) return false;
				if (query.topic && q.topic !== query.topic) return false;
				if (query.subtopic && q.subtopic !== query.subtopic) return false;
				if (query.type && q.type !== query.type) return false;
				if (query.difficulties?.length && !query.difficulties.includes(q.difficulty)) return false;
				if (query.cognitiveLevels?.length && !query.cognitiveLevels.includes(q.cognitiveLevel)) return false;
				if (query.questionFamilies?.length && !query.questionFamilies.includes(q.questionFamily)) return false;
				if (query.statuses?.length && !query.statuses.includes(q.status ?? 'active')) return false;
				if (!includesAll(q.tags, query.tags)) return false;
				if (!includesAll(q.knowledgeConcepts, query.knowledgeConcepts)) return false;
				if (!includesAll(q.applicationDomains, query.applicationDomains)) return false;
				return true;
			})
			.map((q) => structuredClone(q));
	}

	questionsByConcept(conceptId: string): Question[] {
		return this.queryQuestions({ knowledgeConcepts: [conceptId] });
	}

	questionsByConcepts(conceptIds: string[]): Question[] {
		return this.queryQuestions({ knowledgeConcepts: conceptIds });
	}

	questionsByTopic(topic: string): Question[] {
		return this.queryQuestions({ topic });
	}

	questionsByTag(tag: string): Question[] {
		return this.queryQuestions({ tags: [tag] });
	}

	questionsByApplicationDomain(domain: string): Question[] {
		return this.queryQuestions({ applicationDomains: [domain] });
	}

	relatedQuestions(questionId: string): Question[] {
		const q = this.getQuestion(questionId);
		if (!q) return [];
		const ids = new Set(q.relationships?.related ?? []);
		const result = this.bank.questions.filter((item) => ids.has(item.id));
		return result.map((item) => structuredClone(item));
	}

	prerequisiteQuestions(questionId: string): Question[] {
		const q = this.getQuestion(questionId);
		if (!q) return [];
		const ids = new Set(q.relationships?.prerequisites ?? []);
		return this.bank.questions
			.filter((item) => ids.has(item.id))
			.map((item) => structuredClone(item));
	}

	followUpQuestions(questionId: string): Question[] {
		const q = this.getQuestion(questionId);
		if (!q) return [];
		const ids = new Set(q.relationships?.followUps ?? []);
		return this.bank.questions
			.filter((item) => ids.has(item.id))
			.map((item) => structuredClone(item));
	}

	contrastQuestions(questionId: string): Question[] {
		const q = this.getQuestion(questionId);
		if (!q) return [];
		const ids = new Set(q.relationships?.contrastsWith ?? []);
		return this.bank.questions
			.filter((item) => ids.has(item.id))
			.map((item) => structuredClone(item));
	}

	getTaxonomy(): {
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
	} {
		const questions = this.bank.questions;
		const collect = (values: string[]): string[] =>
			[...new Set(values.filter((x) => x.trim()))].sort((a, b) => a.localeCompare(b));

		return {
			subjects: collect(questions.map((q) => q.subject)),
			topics: collect(questions.map((q) => q.topic)),
			subtopics: collect(questions.map((q) => q.subtopic ?? '')),
			tags: collect(questions.flatMap((q) => q.tags ?? [])),
			knowledgeConcepts: collect(questions.flatMap((q) => q.knowledgeConcepts ?? [])),
			applicationDomains: collect(questions.flatMap((q) => q.applicationDomains ?? [])),
			types: [...new Set(questions.map((q) => q.type))].sort(),
			difficulties: [...new Set(questions.map((q) => q.difficulty))].sort((a, b) => a - b),
			cognitiveLevels: collect(questions.map((q) => q.cognitiveLevel)) as CognitiveLevel[],
			questionFamilies: collect(questions.map((q) => q.questionFamily)) as QuestionFamily[],
		};
	}

	async load(): Promise<void> {
		const f = this.app.vault.getAbstractFileByPath(QUESTION_BANK_PATH);
		if (!(f instanceof TFile)) return;
		const result = validateQuestionBank(JSON.parse(await this.app.vault.read(f)) as unknown);
		if (!result.bank) {
			throw new Error(result.issues.map((x) => `${x.path}: ${x.message}`).join('; '));
		}
		this.bank = result.bank;
	}

	async save(): Promise<void> {
		await this.ensureFolders();
		const text = `${JSON.stringify(this.bank, null, 2)}\n`;
		const f = this.app.vault.getAbstractFileByPath(QUESTION_BANK_PATH);
		if (f instanceof TFile) await this.app.vault.modify(f, text);
		else await this.app.vault.create(QUESTION_BANK_PATH, text);
	}

	prepareImport(raw: unknown): ImportPreview {
		const v = validateQuestionBank(raw);
		const empty = this.getBank();
		if (!v.bank) {
			return {
				bank: empty,
				issues: v.issues,
				newQuestions: [],
				replaceQuestions: [],
				duplicates: [],
			};
		}

		const byId = new Map(this.bank.questions.map((q) => [q.id, q]));
		const byPrompt = new Map(this.bank.questions.map((q) => [norm(q.question), q]));
		const byFp = new Map(this.bank.questions.map((q) => [fingerprint(q), q]));
		const newQuestions: Question[] = [];
		const replaceQuestions: Question[] = [];
		const duplicates: DuplicateMatch[] = [];

		for (const q of v.bank.questions) {
			const idMatch = byId.get(q.id);
			if (idMatch) {
				const conflict = JSON.stringify(idMatch) !== JSON.stringify(q);
				duplicates.push({
					incomingId: q.id,
					existingId: idMatch.id,
					reason: 'id',
					conflict,
				});
				if (conflict) replaceQuestions.push(q);
				continue;
			}

			const promptMatch = byPrompt.get(norm(q.question));
			if (promptMatch) {
				const conflict = fingerprint(promptMatch) !== fingerprint(q);
				duplicates.push({
					incomingId: q.id,
					existingId: promptMatch.id,
					reason: 'prompt',
					conflict,
				});
				continue;
			}

			const fpMatch = byFp.get(fingerprint(q));
			if (fpMatch) {
				duplicates.push({
					incomingId: q.id,
					existingId: fpMatch.id,
					reason: 'fingerprint',
					conflict: false,
				});
				continue;
			}

			newQuestions.push(q);
		}

		return {
			bank: v.bank,
			issues: v.issues,
			newQuestions,
			replaceQuestions,
			duplicates,
		};
	}

	async commitImport(preview: ImportPreview, replaceConflicts: boolean): Promise<void> {
		const map = new Map(this.bank.questions.map((q) => [q.id, q]));
		for (const q of preview.newQuestions) map.set(q.id, q);
		if (replaceConflicts) {
			for (const q of preview.replaceQuestions) map.set(q.id, q);
		}
		this.bank.questions = [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
		this.bank.bank = preview.bank.bank;
		await this.save();
	}

	async createQuestion(q: Question): Promise<void> {
		if (this.bank.questions.some((item) => item.id === q.id)) {
			throw new Error(`Question ID already exists: ${q.id}`);
		}
		const candidate = structuredClone(this.bank);
		candidate.questions.push(q);
		const v = validateQuestionBank(candidate);
		if (!v.bank) throw new Error(v.issues.map((x) => `${x.path}: ${x.message}`).join('; '));
		this.bank = candidate;
		await this.save();
	}

	async updateQuestion(q: Question): Promise<void> {
		const i = this.bank.questions.findIndex((x) => x.id === q.id);
		if (i < 0) throw new Error(`Question not found: ${q.id}`);

		const candidate = structuredClone(this.bank);
		candidate.questions[i] = {
			...q,
			version: q.version + 1,
			updatedAt: new Date().toISOString(),
		};
		const v = validateQuestionBank(candidate);
		if (!v.bank) throw new Error(v.issues.map((x) => `${x.path}: ${x.message}`).join('; '));
		this.bank = candidate;
		await this.save();
	}

	async setStatus(id: string, status: QuestionStatus): Promise<void> {
		const q = this.bank.questions.find((item) => item.id === id);
		if (!q) throw new Error(`Question not found: ${id}`);
		q.status = status;
		q.updatedAt = new Date().toISOString();
		await this.save();
	}

	async markDuplicate(id: string, duplicateOf: string): Promise<void> {
		if (id === duplicateOf) throw new Error('A question cannot be a duplicate of itself.');
		const source = this.bank.questions.find((item) => item.id === duplicateOf);
		const target = this.bank.questions.find((item) => item.id === id);
		if (!source || !target) throw new Error('Both duplicate questions must exist.');
		target.status = 'confirmed-duplicate';
		target.duplicateOf = duplicateOf;
		target.verification = {
			...(target.verification ?? { status: 'possible-duplicate' }),
			status: 'possible-duplicate',
			notes: `Manually marked as duplicate of ${duplicateOf}.`,
		};
		target.updatedAt = new Date().toISOString();
		await this.save();
	}

	async clearDuplicate(id: string): Promise<void> {
		const target = this.bank.questions.find((item) => item.id === id);
		if (!target) throw new Error(`Question not found: ${id}`);
		target.status = 'active';
		delete target.duplicateOf;
		if (target.verification?.status === 'possible-duplicate') {
			delete target.verification;
		}
		target.updatedAt = new Date().toISOString();
		await this.save();
	}

	async archiveQuestions(ids: string[]): Promise<void> {
		for (const q of this.bank.questions) {
			if (ids.includes(q.id)) q.status = 'archived';
		}
		await this.save();
	}

	async deleteQuestion(id: string): Promise<void> {
		this.bank.questions = this.bank.questions.filter((q) => q.id !== id);
		await this.save();
	}

	private async ensureFolders(): Promise<void> {
		if (!this.app.vault.getAbstractFileByPath('_Practice')) {
			await this.app.vault.createFolder('_Practice');
		}
		if (!this.app.vault.getAbstractFileByPath('_Practice/Question Banks')) {
			await this.app.vault.createFolder('_Practice/Question Banks');
		}
	}
}
