export const QUESTION_SCHEMA_VERSION = '1.0';

export type QuestionType =
	| 'mcq'
	| 'multiple-select'
	| 'true-false'
	| 'written'
	| 'numerical'
	| 'matching'
	| 'ordering'
	| 'identification'
	| 'viva'
	| 'multi-part';

export type CognitiveLevel =
	| 'recall'
	| 'understanding'
	| 'application'
	| 'analysis'
	| 'evaluation'
	| 'creation';

export type QuestionFamily =
	| 'fact-recall'
	| 'conceptual'
	| 'calculation'
	| 'comparison'
	| 'interpretation'
	| 'diagnosis'
	| 'troubleshooting'
	| 'scenario'
	| 'procedure'
	| 'design-decision'
	| 'diagram-analysis'
	| 'data-analysis'
	| 'identification'
	| 'sequencing'
	| 'reasoning';

export type QuestionStatus = 'active' | 'archived' | 'confirmed-duplicate';

export interface QuestionOption {
	id: string;
	text: string;
}

export interface Misconception {
	statement: string;
	whyWrong: string;
}

export interface QuestionAnswer {
	short: string;
	model: string;
	explanation?: string;
	working?: string;
	keyPoints?: string[];
	commonMistakes?: string[];
	misconceptions?: Misconception[];
	acceptableAlternatives?: string[];
}

export interface Evaluation {
	essentialPoints?: string[];
	optionalPoints?: string[];
	acceptableAlternatives?: string[];
	commonMisconceptions?: Misconception[];
	rubric?: Array<{ criterion: string; points: number; description: string }>;
}

export interface DiagramRef {
	id: string;
	type: 'svg' | 'image' | 'table' | 'interactive-svg' | 'interactive-data';
	path?: string;
	status?: 'available' | 'missing';
	description?: string;
}

export interface NumericalSolution {
	given?: Record<string, string | number>;
	required?: string;
	formula?: string;
	variables?: Record<string, string>;
	steps?: string[];
	finalAnswer?: string | number;
	unit?: string;
	tolerance?: number;
}

export type VivaStyle =
	| 'definition'
	| 'explain'
	| 'why'
	| 'why-not'
	| 'compare'
	| 'troubleshoot'
	| 'scenario'
	| 'procedure'
	| 'safety'
	| 'design-decision'
	| 'rapid-fire'
	| 'follow-up';

export interface VivaConfig {
	style: VivaStyle;
	keyPoints?: string[];
	followUpQuestionIds?: string[];
	rubric?: Array<{ criterion: string; points: number; description: string }>;
}

export interface Relationships {
	prerequisites?: string[];
	related?: string[];
	followUps?: string[];
	contrastsWith?: string[];
	harderVersions?: string[];
	easierVersions?: string[];
}

export interface SourceInfo {
	type:
		| 'user-provided'
		| 'textbook'
		| 'standard'
		| 'lecture-notes'
		| 'manufacturer-document'
		| 'official-document'
		| 'AI-generated-draft'
		| 'unknown';
	reference?: string;
	locator?: string;
}

export interface Verification {
	status: 'verified' | 'needs-review' | 'possible-duplicate' | 'draft';
	notes?: string;
}

export interface Question {
	id: string;
	version: number;
	type: QuestionType;
	subject: string;
	topic: string;
	subtopic?: string;
	tags?: string[];
	knowledgeConcepts?: string[];
	applicationDomains?: string[];
	difficulty: 1 | 2 | 3 | 4 | 5;
	cognitiveLevel: CognitiveLevel;
	questionFamily: QuestionFamily;
	question: string;
	options?: QuestionOption[];
	correctAnswer?: string[];
	hints?: string[];
	answer: QuestionAnswer;
	evaluation?: Evaluation;
	diagram?: DiagramRef;
	solution?: NumericalSolution;
	viva?: VivaConfig;
	relationships?: Relationships;
	source?: SourceInfo;
	verification?: Verification;
	status?: QuestionStatus;
	duplicateOf?: string;
	createdAt?: string;
	updatedAt?: string;
}

export interface QuestionBank {
	schemaVersion: string;
	bank: { id: string; name: string; description?: string };
	questions: Question[];
}