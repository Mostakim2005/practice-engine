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
	answerChanges?: number;
	answerRevealed?: boolean;
	errorType?: string;
	representationType?: string;
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
	/** Questions already selected for this session, in selection order. */
	questionIds: string[];
	/** Full eligible pool from which the selector may choose. */
	candidateQuestionIds?: string[];
	/** Maximum number of questions the learner requested. */
	maxQuestions?: number;
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

export interface QuestionPerformance {
	questionId: string;
	attemptCount: number;
	correctCount: number;
	incorrectCount: number;
	partialCount: number;
	skippedCount: number;
	accuracy: number | null;
	averageScore: number | null;
	averageConfidence: number | null;
	averageTimeSpentMs: number | null;
	totalHintsUsed: number;
	lastAttemptAt?: string;
	lastResult?: AttemptResult;
	lastConfidence?: number;
}

export interface ConceptPerformance {
	conceptId: string;
	questionCount: number;
	attemptCount: number;
	correctCount: number;
	accuracy: number | null;
	averageConfidence: number | null;
	averageTimeSpentMs: number | null;
}

export interface PracticeSummary {
	attemptCount: number;
	correctCount: number;
	incorrectCount: number;
	partialCount: number;
	skippedCount: number;
	accuracy: number | null;
	averageScore: number | null;
	averageConfidence: number | null;
	averageTimeSpentMs: number | null;
	totalHintsUsed: number;
}
