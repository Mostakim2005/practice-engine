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

export type PracticeSessionStatus = 'created' | 'started' | 'completed' | 'abandoned' | 'interrupted';

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

export interface PracticeFilters {
	subject?: string;
	topic?: string;
	subtopic?: string;
	types?: string[];
	difficulties?: number[];
	excludeIds?: string[];
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
