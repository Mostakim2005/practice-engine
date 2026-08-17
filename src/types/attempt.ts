import { CognitiveLevel, QuestionFamily, QuestionType } from './question';

export type AttemptResult = 'correct' | 'incorrect' | 'partial' | 'skipped';

export interface AttemptEvent {
	id: string;
	questionId: string;
	sessionId: string;
	timestamp: string;
	response: unknown;
	correctness?: boolean;
	result: AttemptResult;
	score?: number;
	confidence?: number;
	timeSpentMs?: number;
	hintsUsed?: number;
	hintLevelReached?: number;
	selfCorrected?: boolean;
	questionVariant?: string;
	selectionStrategy?: string;
	selectionFactors?: string[];
}

export type PracticeSessionStatus =
	| 'created'
	| 'started'
	| 'completed'
	| 'abandoned'
	| 'interrupted';

export interface PracticeFilters {
	subject?: string;
	topic?: string;
	subtopic?: string;
	tags?: string[];
	knowledgeConcepts?: string[];
	applicationDomains?: string[];
	types?: QuestionType[];
	difficulties?: number[];
	cognitiveLevels?: CognitiveLevel[];
	questionFamilies?: QuestionFamily[];
	excludeIds?: string[];
}

export interface PracticeSession {
	id: string;
	createdAt: string;
	startedAt?: string;
	completedAt?: string;
	status: PracticeSessionStatus;
	questionIds: string[];
	currentIndex: number;
	filters?: PracticeFilters;
}

export interface SessionConstraints {
	maxQuestions?: number;
	allowRepeat?: boolean;
}

export interface SelectionContext {
	sessionId: string;
	availableQuestionIds: string[];
	recentQuestionIds: string[];
	filters?: PracticeFilters;
	sessionConstraints?: SessionConstraints;
}

export interface QuestionSelectionResult {
	questionId: string;
	strategy: string;
	factors?: string[];
}
