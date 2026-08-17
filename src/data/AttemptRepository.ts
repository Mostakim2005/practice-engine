import { App, TFile } from 'obsidian';
import { AttemptEvent, AttemptResult, PracticeSession, PracticeSummary } from '../types/attempt';

const ATTEMPTS_PATH = '_Practice/Learner State/attempts.json';
const SESSIONS_PATH = '_Practice/Practice Sessions/sessions.json';

interface AttemptStore {
	version: string;
	events: AttemptEvent[];
}

interface SessionStore {
	version: string;
	sessions: PracticeSession[];
}

function id(prefix: string): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return `${prefix}-${crypto.randomUUID()}`;
	}
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function average(values: number[]): number | null {
	return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export class AttemptRepository {
	constructor(private readonly app: App) {}

	async append(event: Omit<AttemptEvent, 'id'>): Promise<AttemptEvent> {
		const store = await this.loadAttempts();
		const created: AttemptEvent = { id: id('attempt'), ...event };
		store.events.push(created);
		await this.saveAttempts(store);
		return structuredClone(created);
	}

	async createSession(session: Omit<PracticeSession, 'id'>): Promise<PracticeSession> {
		const store = await this.loadSessions();
		const created: PracticeSession = { id: id('session'), ...session };
		store.sessions.push(created);
		await this.saveSessions(store);
		return structuredClone(created);
	}

	async updateSession(session: PracticeSession): Promise<void> {
		const store = await this.loadSessions();
		const index = store.sessions.findIndex((x) => x.id === session.id);
		if (index < 0) store.sessions.push(structuredClone(session));
		else store.sessions[index] = structuredClone(session);
		await this.saveSessions(store);
	}

	async listAttempts(questionId?: string): Promise<AttemptEvent[]> {
		const store = await this.loadAttempts();
		const events = questionId ? store.events.filter((x) => x.questionId === questionId) : store.events;
		return structuredClone(events).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
	}

	async listAttemptsForSession(sessionId: string): Promise<AttemptEvent[]> {
		const events = await this.listAttempts();
		return events.filter((x) => x.sessionId === sessionId);
	}

	async listSessions(): Promise<PracticeSession[]> {
		const sessions = (await this.loadSessions()).sessions;
		return structuredClone(sessions).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}

	async getSummary(questionId?: string): Promise<PracticeSummary> {
		const attempts = await this.listAttempts(questionId);
		const correctness = attempts.filter((x) => typeof x.correctness === 'boolean');
		const scores = attempts.flatMap((x) => (typeof x.score === 'number' ? [x.score] : []));
		const confidences = attempts.flatMap((x) => (typeof x.confidence === 'number' ? [x.confidence] : []));
		const times = attempts.flatMap((x) => (typeof x.timeSpentMs === 'number' ? [x.timeSpentMs] : []));
		const correctCount = attempts.filter((x) => x.result === 'correct').length;

		return {
			attemptCount: attempts.length,
			correctCount,
			incorrectCount: attempts.filter((x) => x.result === 'incorrect').length,
			partialCount: attempts.filter((x) => x.result === 'partial').length,
			skippedCount: attempts.filter((x) => x.result === 'skipped').length,
			accuracy: correctness.length ? correctCount / correctness.length : null,
			averageScore: average(scores),
			averageConfidence: average(confidences),
			averageTimeSpentMs: average(times),
			totalHintsUsed: attempts.reduce((sum, x) => sum + (x.hintsUsed ?? 0), 0),
		};
	}

	async getQuestionPerformance(questionId: string) {
		const attempts = await this.listAttempts(questionId);
		const summary = await this.getSummary(questionId);
		const last = attempts.at(-1);
		return {
			questionId,
			attemptCount: summary.attemptCount,
			correctCount: summary.correctCount,
			incorrectCount: summary.incorrectCount,
			partialCount: summary.partialCount,
			skippedCount: summary.skippedCount,
			accuracy: summary.accuracy,
			averageScore: summary.averageScore,
			averageConfidence: summary.averageConfidence,
			averageTimeSpentMs: summary.averageTimeSpentMs,
			totalHintsUsed: summary.totalHintsUsed,
			lastAttemptAt: last?.timestamp,
			lastResult: last?.result,
			lastConfidence: last?.confidence,
		};
	}

	async getQuestionPerformances(questionIds: string[]): Promise<Array<Awaited<ReturnType<AttemptRepository['getQuestionPerformance']>>>> {
		return Promise.all(questionIds.map((questionId) => this.getQuestionPerformance(questionId)));
	}

	async listWrongQuestionIds(): Promise<string[]> {
		const latestByQuestion = new Map<string, AttemptEvent>();
		for (const event of await this.listAttempts()) latestByQuestion.set(event.questionId, event);
		return [...latestByQuestion.values()]
			.filter((x) => x.result === 'incorrect' || x.result === 'partial')
			.map((x) => x.questionId);
	}

	async listRecentlyWrongQuestionIds(limit = 25): Promise<string[]> {
		const attempts = await this.listAttempts();
		return [...attempts]
			.filter((x) => x.result === 'incorrect' || x.result === 'partial')
			.reverse()
			.map((x) => x.questionId)
			.filter((questionId, index, ids) => ids.indexOf(questionId) === index)
			.slice(0, limit);
	}

	async getOverallSummary(): Promise<PracticeSummary> {
		return this.getSummary();
	}

	async getAttemptCountsByResult(): Promise<Record<AttemptResult, number>> {
		const attempts = await this.listAttempts();
		return {
			correct: attempts.filter((x) => x.result === 'correct').length,
			incorrect: attempts.filter((x) => x.result === 'incorrect').length,
			partial: attempts.filter((x) => x.result === 'partial').length,
			skipped: attempts.filter((x) => x.result === 'skipped').length,
		};
	}

	private async loadAttempts(): Promise<AttemptStore> {
		const file = this.app.vault.getAbstractFileByPath(ATTEMPTS_PATH);
		if (!(file instanceof TFile)) return { version: '1.0', events: [] };
		try {
			const raw = JSON.parse(await this.app.vault.read(file)) as Partial<AttemptStore>;
			return {
				version: typeof raw.version === 'string' ? raw.version : '1.0',
				events: Array.isArray(raw.events) ? raw.events : [],
			};
		} catch {
			return { version: '1.0', events: [] };
		}
	}

	private async saveAttempts(store: AttemptStore): Promise<void> {
		await this.ensureFolders();
		const text = `${JSON.stringify(store, null, 2)}\n`;
		const file = this.app.vault.getAbstractFileByPath(ATTEMPTS_PATH);
		if (file instanceof TFile) await this.app.vault.modify(file, text);
		else await this.app.vault.create(ATTEMPTS_PATH, text);
	}

	private async loadSessions(): Promise<SessionStore> {
		const file = this.app.vault.getAbstractFileByPath(SESSIONS_PATH);
		if (!(file instanceof TFile)) return { version: '1.0', sessions: [] };
		try {
			const raw = JSON.parse(await this.app.vault.read(file)) as Partial<SessionStore>;
			return {
				version: typeof raw.version === 'string' ? raw.version : '1.0',
				sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
			};
		} catch {
			return { version: '1.0', sessions: [] };
		}
	}

	private async saveSessions(store: SessionStore): Promise<void> {
		await this.ensureFolders();
		const text = `${JSON.stringify(store, null, 2)}\n`;
		const file = this.app.vault.getAbstractFileByPath(SESSIONS_PATH);
		if (file instanceof TFile) await this.app.vault.modify(file, text);
		else await this.app.vault.create(SESSIONS_PATH, text);
	}

	private async ensureFolders(): Promise<void> {
		for (const path of ['_Practice', '_Practice/Learner State', '_Practice/Practice Sessions']) {
			if (!this.app.vault.getAbstractFileByPath(path)) await this.app.vault.createFolder(path);
		}
	}
}
