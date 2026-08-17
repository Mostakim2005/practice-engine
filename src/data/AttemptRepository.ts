import { App, TFile } from 'obsidian';
import { AttemptEvent, PracticeSession } from '../types/attempt';

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

export class AttemptRepository {
	constructor(private readonly app: App) {}

	async append(event: Omit<AttemptEvent, 'id'>): Promise<AttemptEvent> {
		const store = await this.loadAttempts();
		const created: AttemptEvent = { id: id('attempt'), ...event };
		store.events.push(created);
		await this.saveAttempts(store);
		return created;
	}

	async createSession(session: Omit<PracticeSession, 'id'>): Promise<PracticeSession> {
		const store = await this.loadSessions();
		const created: PracticeSession = { id: id('session'), ...session };
		store.sessions.push(created);
		await this.saveSessions(store);
		return created;
	}

	async updateSession(session: PracticeSession): Promise<void> {
		const store = await this.loadSessions();
		const index = store.sessions.findIndex((x) => x.id === session.id);
		if (index < 0) {
			store.sessions.push(session);
		} else {
			store.sessions[index] = session;
		}
		await this.saveSessions(store);
	}

	async listAttempts(questionId?: string): Promise<AttemptEvent[]> {
		const store = await this.loadAttempts();
		return questionId ? store.events.filter((x) => x.questionId === questionId) : store.events;
	}

	async listSessions(): Promise<PracticeSession[]> {
		return (await this.loadSessions()).sessions;
	}

	private async loadAttempts(): Promise<AttemptStore> {
		const file = this.app.vault.getAbstractFileByPath(ATTEMPTS_PATH);
		if (!(file instanceof TFile)) return { version: '1.0', events: [] };
		const raw = JSON.parse(await this.app.vault.read(file)) as Partial<AttemptStore>;
		return {
			version: typeof raw.version === 'string' ? raw.version : '1.0',
			events: Array.isArray(raw.events) ? raw.events : [],
		};
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
		const raw = JSON.parse(await this.app.vault.read(file)) as Partial<SessionStore>;
		return {
			version: typeof raw.version === 'string' ? raw.version : '1.0',
			sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
		};
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
