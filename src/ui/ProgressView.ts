import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type PracticePlugin from '../main';
import { AttemptRepository } from '../data/AttemptRepository';
import { Question } from '../types/question';
import { PracticeSummary } from '../types/attempt';

export const PROGRESS_VIEW_TYPE = 'practice-engine-progress';

export class ProgressView extends ItemView {
	constructor(leaf: WorkspaceLeaf, private readonly plugin: PracticePlugin) {
		super(leaf);
	}

	getViewType(): string {
		return PROGRESS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Practice progress';
	}

	getIcon(): string {
		return 'bar-chart-3';
	}

	onOpen(): Promise<void> {
		void this.render();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		return Promise.resolve();
	}

	async render(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass('practice-progress-view');
		root.createEl('h2', { text: 'Practice progress' });
		root.createEl('p', {
			text: 'Observed practice evidence only. This view does not claim mastery or determine review schedules.',
		});

		const summary = await this.plugin.attempts.getOverallSummary();
		this.renderSummary(root, summary);

		const recent = await this.plugin.attempts.listRecentlyWrongQuestionIds(15);
		this.renderQuestionSection(root, 'Recently incorrect or partial', recent);

		const latestWrong = await this.plugin.attempts.listWrongQuestionIds();
		this.renderQuestionSection(root, 'Latest result still needs review', latestWrong);

		await this.renderSessions(root);
	}

	private renderSummary(root: HTMLElement, summary: PracticeSummary): void {
		const grid = root.createDiv({ cls: 'practice-progress-summary' });
		this.metric(grid, 'Attempts', String(summary.attemptCount));
		this.metric(grid, 'Accuracy', summary.accuracy === null ? '—' : `${Math.round(summary.accuracy * 100)}%`);
		this.metric(grid, 'Correct', String(summary.correctCount));
		this.metric(grid, 'Partial', String(summary.partialCount));
		this.metric(grid, 'Average confidence', summary.averageConfidence === null ? '—' : summary.averageConfidence.toFixed(1));
		this.metric(
			grid,
			'Average response time',
			summary.averageTimeSpentMs === null ? '—' : `${Math.round(summary.averageTimeSpentMs / 1000)} s`,
		);
		this.metric(grid, 'Hints used', String(summary.totalHintsUsed));
	}

	private metric(parent: HTMLElement, name: string, value: string): void {
		const block = parent.createDiv({ cls: 'practice-progress-metric' });
		block.createEl('strong', { text: value });
		block.createEl('small', { text: name });
	}

	private renderQuestionSection(root: HTMLElement, heading: string, ids: string[]): void {
		const section = root.createDiv();
		section.createEl('h3', { text: heading });
		if (!ids.length) {
			section.createEl('p', { text: 'None recorded.' });
			return;
		}

		for (const id of ids) {
			const q = this.plugin.repository.getQuestion(id);
			if (!q) continue;
			const row = section.createDiv({ cls: 'practice-progress-row' });
			row.createEl('strong', { text: q.id });
			row.createEl('span', { text: `${q.subject} › ${q.topic}` });
		}
	}

	private async renderSessions(root: HTMLElement): Promise<void> {
		const section = root.createDiv();
		section.createEl('h3', { text: 'Recent practice sessions' });
		const sessions = await this.plugin.attempts.listSessions();
		if (!sessions.length) {
			section.createEl('p', { text: 'No practice sessions recorded yet.' });
			return;
		}

		for (const session of sessions.slice(0, 20)) {
			const row = section.createDiv({ cls: 'practice-progress-row' });
			row.createEl('span', {
				text: `${new Date(session.createdAt).toLocaleString()} — ${session.status} — ${session.currentIndex}/${session.maxQuestions ?? session.questionIds.length} answered`,
			});
		}
	}
}
