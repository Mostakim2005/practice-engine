import { ItemView, WorkspaceLeaf } from 'obsidian';
import type PracticePlugin from '../main';
import { PracticeSummary } from '../types/attempt';

export const PROGRESS_VIEW_TYPE = 'practice-engine-progress';

export class ProgressView extends ItemView {
	constructor(leaf: WorkspaceLeaf, private readonly plugin: PracticePlugin) { super(leaf); }
	getViewType(): string { return PROGRESS_VIEW_TYPE; }
	getDisplayText(): string { return 'Practice progress'; }
	getIcon(): string { return 'bar-chart-3'; }
	onOpen(): Promise<void> { void this.render(); return Promise.resolve(); }
	onClose(): Promise<void> { return Promise.resolve(); }

	async render(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass('practice-progress-view');
		const header = root.createDiv({ cls: 'practice-page-header' });
		const title = header.createDiv();
		title.createEl('h2', { text: 'Practice progress' });
		title.createEl('p', { cls: 'practice-muted', text: 'A local summary of your recorded practice evidence.' });
		const actions = header.createDiv({ cls: 'practice-header-actions' });
		const start = actions.createEl('button', { text: 'Start practice' });
		start.addEventListener('click', () => void this.plugin.activatePracticeView());
		const sidebar = actions.createEl('button', { text: 'Open sidebar' });
		sidebar.addEventListener('click', () => void this.plugin.activateSidebarView());

		const summary = await this.plugin.attempts.getOverallSummary();
		this.renderSummary(root, summary);
		const weak = await this.plugin.attempts.listRecentlyWrongQuestionIds(8);
		this.renderQuestions(root, 'Weak areas to review', weak);
		await this.renderTopicCoverage(root);
		await this.renderSessions(root);
	}

	private renderSummary(root: HTMLElement, summary: PracticeSummary): void {
		const grid = root.createDiv({ cls: 'practice-progress-summary' });
		this.metric(grid, 'Attempts', String(summary.attemptCount));
		this.metric(grid, 'Accuracy', summary.accuracy === null ? '—' : `${Math.round(summary.accuracy * 100)}%`);
		this.metric(grid, 'Correct', String(summary.correctCount));
		this.metric(grid, 'Partial', String(summary.partialCount));
		this.metric(grid, 'Hints used', String(summary.totalHintsUsed));
		this.metric(grid, 'Avg confidence', summary.averageConfidence === null ? '—' : summary.averageConfidence.toFixed(1));
		this.metric(grid, 'Avg response', summary.averageTimeSpentMs === null ? '—' : `${Math.round(summary.averageTimeSpentMs / 1000)}s`);
	}

	private metric(parent: HTMLElement, name: string, value: string): void {
		const block = parent.createDiv({ cls: 'practice-progress-metric' });
		block.createEl('strong', { text: value });
		block.createEl('small', { text: name });
	}

	private renderQuestions(root: HTMLElement, heading: string, ids: string[]): void {
		const section = root.createDiv({ cls: 'practice-progress-section' });
		section.createEl('h3', { text: heading });
		if (!ids.length) {
			section.createEl('p', { cls: 'practice-muted', text: 'Nothing recorded yet.' });
			return;
		}
		for (const id of ids) {
			const q = this.plugin.repository.getQuestion(id);
			if (!q) continue;
			const row = section.createDiv({ cls: 'practice-progress-row' });
			row.createEl('strong', { text: q.subject });
			row.createEl('span', { text: `${q.topic}${q.subtopic ? ` › ${q.subtopic}` : ''}` });
		}
	}

	private async renderTopicCoverage(root: HTMLElement): Promise<void> {
		const section = root.createDiv({ cls: 'practice-progress-section' });
		section.createEl('h3', { text: 'Topic coverage' });
		const attempts = await this.plugin.attempts.listAttempts();
		if (!attempts.length) {
			section.createEl('p', { cls: 'practice-muted', text: 'Start practicing to build topic coverage.' });
			return;
		}
		const byTopic = new Map<string, { attempts: number; correct: number }>();
		for (const event of attempts) {
			const q = this.plugin.repository.getQuestion(event.questionId);
			if (!q) continue;
			const key = `${q.subject} › ${q.topic}`;
			const current = byTopic.get(key) ?? { attempts: 0, correct: 0 };
			current.attempts += 1;
			if (event.result === 'correct') current.correct += 1;
			byTopic.set(key, current);
		}
		for (const [topic, data] of [...byTopic.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 20)) {
			const row = section.createDiv({ cls: 'practice-progress-row' });
			row.createEl('strong', { text: topic });
			row.createEl('span', { text: `${data.correct}/${data.attempts} correct` });
		}
	}

	private async renderSessions(root: HTMLElement): Promise<void> {
		const section = root.createDiv({ cls: 'practice-progress-section' });
		section.createEl('h3', { text: 'Recent sessions' });
		const sessions = await this.plugin.attempts.listSessions();
		if (!sessions.length) {
			section.createEl('p', { cls: 'practice-muted', text: 'No practice sessions recorded yet.' });
			return;
		}
		for (const session of sessions.slice(0, 10)) {
			const row = section.createDiv({ cls: 'practice-progress-row' });
			const max = session.maxQuestions ?? session.questionIds.length;
			row.createEl('strong', { text: session.status });
			row.createEl('span', { text: `${new Date(session.createdAt).toLocaleString()} · ${session.currentIndex}/${max}` });
		}
	}
}
