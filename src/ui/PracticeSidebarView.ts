import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type PracticePlugin from '../main';

export const PRACTICE_SIDEBAR_VIEW_TYPE = 'practice-engine-sidebar';

export class PracticeSidebarView extends ItemView {
	constructor(leaf: WorkspaceLeaf, private readonly plugin: PracticePlugin) {
		super(leaf);
	}

	getViewType(): string { return PRACTICE_SIDEBAR_VIEW_TYPE; }
	getDisplayText(): string { return 'Practice'; }
	getIcon(): string { return 'graduation-cap'; }

	async onOpen(): Promise<void> {
		await this.render();
	}

	async render(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass('practice-sidebar');

		root.createEl('h3', { text: 'Practice' });
		root.createEl('p', { cls: 'practice-sidebar-subtitle', text: 'Study, review, and track progress.' });

		const actions = root.createDiv({ cls: 'practice-sidebar-actions' });
		this.action(actions, 'Start practice', 'graduation-cap', () => void this.plugin.activatePracticeView());
		this.action(actions, 'Question bank', 'library', () => void this.plugin.activateQuestionBankView());
		this.action(actions, 'Progress', 'bar-chart-3', () => void this.plugin.activateProgressView());

		const summary = await this.plugin.attempts.getOverallSummary();
		const card = root.createDiv({ cls: 'practice-sidebar-card' });
		card.createEl('strong', { text: 'Overview' });
		const metrics = card.createDiv({ cls: 'practice-sidebar-metrics' });
		this.metric(metrics, 'Accuracy', summary.accuracy === null ? '—' : `${Math.round(summary.accuracy * 100)}%`);
		this.metric(metrics, 'Attempts', String(summary.attemptCount));
		this.metric(metrics, 'Hints', String(summary.totalHintsUsed));

		const weak = await this.plugin.attempts.listRecentlyWrongQuestionIds(5);
		const weakSection = root.createDiv({ cls: 'practice-sidebar-card' });
		weakSection.createEl('strong', { text: 'Review next' });
		if (!weak.length) {
			weakSection.createEl('p', { cls: 'practice-muted', text: 'No weak questions recorded yet.' });
		} else {
			for (const id of weak) {
				const q = this.plugin.repository.getQuestion(id);
				if (!q) continue;
				const row = weakSection.createEl('button', { cls: 'practice-sidebar-link', text: `${q.subject} › ${q.topic}` });
				row.setAttr('aria-label', `Practice ${q.subject} ${q.topic}`);
				row.addEventListener('click', () => void this.plugin.startPracticeForFilters({ subject: q.subject, topic: q.topic }));
			}
		}
	}

	private action(parent: HTMLElement, text: string, icon: string, callback: () => void): void {
		const button = parent.createEl('button', { cls: 'practice-sidebar-action' });
		const iconEl = button.createSpan({ cls: 'practice-sidebar-action-icon' });
		setIcon(iconEl, icon);
		button.createSpan({ text });
		button.addEventListener('click', callback);
	}

	private metric(parent: HTMLElement, label: string, value: string): void {
		const block = parent.createDiv({ cls: 'practice-sidebar-metric' });
		block.createEl('strong', { text: value });
		block.createEl('small', { text: label });
	}
}
