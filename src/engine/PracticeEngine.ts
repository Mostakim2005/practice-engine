import { QuestionRepository } from '../data/QuestionRepository';
import { AttemptRepository } from '../data/AttemptRepository';
import {
	QuestionSelectionStrategy,
	BasicRandomSelectionStrategy,
} from './selection/QuestionSelectionStrategy';
import { QuestionCandidateGenerator } from './selection/CandidateGenerator';
import { DefaultResponseEvaluator, ResponseEvaluator } from './evaluation/ResponseEvaluator';
import {
	PracticeFilters,
	PracticeSession,
	AttemptEvent,
	SelectionContext,
	SessionConstraints,
} from '../types/attempt';
import { Question } from '../types/question';

export class PracticeEngine {
	private readonly candidates: QuestionCandidateGenerator;
	private readonly evaluator: ResponseEvaluator;
	private session: PracticeSession | null = null;
	private currentQuestion: Question | null = null;
	private currentStartedAt = 0;
	private hintsUsed = 0;
	private hintLevelReached = 0;
	private answerRevealed = false;
	private currentSelectionStrategy = 'basic-random';
	private currentSelectionFactors: string[] = [];

	constructor(
		private readonly repository: QuestionRepository,
		private readonly attempts: AttemptRepository,
		private readonly selectionStrategy: QuestionSelectionStrategy = new BasicRandomSelectionStrategy(),
		evaluator: ResponseEvaluator = new DefaultResponseEvaluator(),
	) {
		this.candidates = new QuestionCandidateGenerator(repository);
		this.evaluator = evaluator;
	}

	async startSession(
		filters?: PracticeFilters,
		constraints?: SessionConstraints,
	): Promise<PracticeSession> {
		const candidateIds = this.candidates
			.getCandidates(filters)
			.map((q) => q.id);

		const maxQuestions = Math.max(
			1,
			Math.min(
				constraints?.maxQuestions ?? 10,
				candidateIds.length || 1,
			),
		);

		this.session =
			await this.attempts.createSession({
				createdAt: new Date().toISOString(),
				startedAt: new Date().toISOString(),
				status: 'started',
				questionIds: [],
				candidateQuestionIds: candidateIds,
				maxQuestions,
				currentIndex: 0,
				filters,
			});

		await this.nextQuestion();
		return this.session;
	}

	getCurrentQuestion(): Question | null {
		return this.currentQuestion
			? structuredClone(this.currentQuestion)
			: null;
	}

	getSession(): PracticeSession | null {
		return this.session
			? structuredClone(this.session)
			: null;
	}

	getHintsUsed(): number {
		return this.hintsUsed;
	}

	getHintLevelReached(): number {
		return this.hintLevelReached;
	}

	getCurrentSelectionStrategy(): string {
		return this.currentSelectionStrategy;
	}

	getCurrentSelectionFactors(): string[] {
		return [...this.currentSelectionFactors];
	}

	useHint(level: number): void {
		this.hintsUsed += 1;
		this.hintLevelReached = Math.max(this.hintLevelReached, level);
	}

	markAnswerRevealed(): void {
		this.answerRevealed = true;
	}

	async answer(
		response: unknown,
		confidence?: number,
		selfAssessment?: 'correct' | 'partial' | 'incorrect',
	): Promise<AttemptEvent | null> {
		if (!this.session || !this.currentQuestion) return null;

		const q = this.currentQuestion;
		const evaluation =
			q.type === 'mcq' || q.type === 'multiple-select'
				? this.evaluator.evaluate(q, response)
				: {
						result: selfAssessment ?? 'partial',
						correctness:
							selfAssessment === 'correct'
								? true
								: selfAssessment === 'incorrect'
									? false
									: undefined,
						score:
							selfAssessment === 'correct'
								? 1
								: selfAssessment === 'partial'
									? 0.5
									: selfAssessment === 'incorrect'
										? 0
										: undefined,
					};

		const event =
			await this.attempts.append({
				questionId: q.id,
				sessionId: this.session.id,
				timestamp: new Date().toISOString(),
				response,
				correctness: evaluation.correctness,
				result: evaluation.result,
				score: evaluation.score,
				confidence,
				timeSpentMs: Math.max(
					0,
					Date.now() - this.currentStartedAt,
				),
				hintsUsed: this.hintsUsed,
				hintLevelReached:
					this.hintLevelReached || undefined,
				selectionStrategy:
					this.currentSelectionStrategy,
				selectionFactors:
					this.currentSelectionFactors,
				answerRevealed: this.answerRevealed,
			});

		this.session.currentIndex += 1;
		await this.attempts.updateSession(this.session);
		return event;
	}

	async nextQuestion(): Promise<Question | null> {
		if (!this.session) return null;

		const maxQuestions =
			this.session.maxQuestions ??
			this.session.candidateQuestionIds?.length ??
			this.session.questionIds.length;

		if (
			this.session.currentIndex >=
			maxQuestions
		) {
			await this.completeSession();
			return null;
		}

		const candidatePool =
			this.session.candidateQuestionIds ??
			this.session.questionIds;

		const recent =
			this.session.questionIds;

		const pool =
			this.candidates
				.byIds(candidatePool)
				.filter(
					(q) =>
						this.session?.filters?.excludeIds?.includes(q.id) !== true,
				);

		const available =
			this.session &&
			this.session.status === 'started'
				? pool.filter(
						(q) =>
							this.session &&
							(this.session.filters?.excludeIds?.includes(q.id) !== true) &&
							(this.session.currentIndex === 0 || !recent.includes(q.id)),
					)
				: pool;

		const fallbackPool =
			available.length
				? available
				: pool.filter(
						(q) => !recent.includes(q.id),
					);

		const finalPool =
			fallbackPool.length
				? fallbackPool
				: pool;

		const context: SelectionContext = {
			sessionId: this.session.id,
			availableQuestionIds:
				finalPool.map((q) => q.id),
			recentQuestionIds: recent,
			filters: this.session.filters,
			sessionConstraints: {
				maxQuestions,
				allowRepeat: false,
			},
		};

		const selected =
			await this.selectionStrategy.selectNextQuestion(
				context,
				finalPool,
			);

		if (!selected) {
			await this.completeSession();
			return null;
		}

		const question =
			this.repository.getQuestion(
				selected.questionId,
			);

		if (!question) {
			await this.completeSession();
			return null;
		}

		this.currentSelectionStrategy =
			selected.strategy;
		this.currentSelectionFactors =
			selected.factors ?? [];
		this.currentQuestion =
			question;
		this.currentStartedAt =
			Date.now();
		this.hintsUsed = 0;
		this.hintLevelReached = 0;
		this.answerRevealed = false;

		if (
			!this.session.questionIds.includes(
				question.id,
			)
		) {
			this.session.questionIds.push(
				question.id,
			);
			await this.attempts.updateSession(
				this.session,
			);
		}

		return structuredClone(
			question,
		);
	}

	async completeSession(): Promise<void> {
		if (
			!this.session ||
			this.session.status === 'completed'
		) {
			return;
		}

		this.session.status =
			'completed';
		this.session.completedAt =
			new Date().toISOString();
		await this.attempts.updateSession(
			this.session,
		);
		this.currentQuestion = null;
	}

	async abandonSession(): Promise<void> {
		if (!this.session) return;

		this.session.status =
			'abandoned';
		this.session.completedAt =
			new Date().toISOString();
		await this.attempts.updateSession(
			this.session,
		);
		this.currentQuestion = null;
	}

	async listAttempts(
		questionId?: string,
	): Promise<AttemptEvent[]> {
		return this.attempts.listAttempts(
			questionId,
		);
	}
}
