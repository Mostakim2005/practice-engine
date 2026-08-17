import { ItemView, Notice, WorkspaceLeaf, setIcon } from 'obsidian';
import type PracticePlugin from '../main';
import { Question } from '../types/question';
import { QuestionSelection } from '../data/QuestionSelection';
import { QuestionEditModal } from './QuestionEditModal';
import { MarkDuplicateModal } from './MarkDuplicateModal';
import { ConfirmActionModal } from './ConfirmActionModal';
import { exportQuestionsHtml } from '../exporters/HtmlExporter';
import { exportQuestionsJson } from '../exporters/JsonExporter';
import { exportQuestionsMarkdown } from '../exporters/MarkdownExporter';

export const QUESTION_BANK_VIEW_TYPE = 'practice-question-bank';

export class QuestionBankView extends ItemView {
	private readonly selection = new QuestionSelection();

	constructor(leaf: WorkspaceLeaf, private readonly plugin: PracticePlugin) {
		super(leaf);
	}

	getViewType(): string {
		return QUESTION_BANK_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Practice question bank';
	}

	getIcon(): string {
		return 'library';
	}

	onOpen(): Promise<void> {
		this.render();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		return Promise.resolve();
	}

	openCreateModal(): void {
		new QuestionEditModal(this.app, null, async (q) => {
			await this.plugin.repository.createQuestion(q);
			this.render();
		}).open();
	}

	render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('practice-question-bank-view');

		const header = root.createDiv({ cls: 'practice-view-header' });
		header.createEl('h2', { text: 'Question bank' });

		const actions = header.createDiv({ cls: 'practice-view-actions' });
		actions.createEl('button', { text: 'Create question' }).addEventListener('click', () => this.openCreateModal());
		actions.createEl('button', { text: 'Import JSON' }).addEventListener('click', () => void this.plugin.chooseAndPreviewImport());
		actions.createEl('button', { text: 'Export all JSON' }).addEventListener('click', () => this.plugin.exportJson());

		const controls = root.createDiv({ cls: 'practice-filters' });
		const search = controls.createEl('input', { type: 'search', placeholder: 'Search questions…' });
		const subject = this.select(controls, 'All subjects');
		const topic = this.select(controls, 'All topics');
		const type = this.select(controls, 'All types');
		const status = this.select(controls, 'All statuses');

		const bank = this.plugin.repository.getBank().questions;

		for (const x of [...new Set(bank.map((q) => q.subject))].sort()) subject.createEl('option', { value: x, text: x });
		for (const x of [...new Set(bank.map((q) => q.topic))].sort()) topic.createEl('option', { value: x, text: x });
		for (const x of [...new Set(bank.map((q) => q.type))].sort()) type.createEl('option', { value: x, text: x });
		for (const x of ['active', 'archived', 'confirmed-duplicate']) {
			status.createEl('option', { value: x, text: x });
		}

		const selectionBar = root.createDiv({ cls: 'practice-selection-bar' });
		const selectionCount = selectionBar.createSpan({ text: '0 Selected' });

		const selectionActions = selectionBar.createDiv({ cls: 'practice-selection-actions' });
		selectionActions.createEl('button', { text: 'Select all' }).addEventListener('click', () => {
			this.selection.selectAll(filteredQuestions().map((q) => q.id));
			draw();
		});
		selectionActions.createEl('button', { text: 'Select none' }).addEventListener('click', () => {
			this.selection.clear();
			draw();
		});
		selectionActions.createEl('button', { text: 'Invert selection' }).addEventListener('click', () => {
			this.selection.invert(filteredQuestions().map((q) => q.id));
			draw();
		});
		selectionActions.createEl('button', { text: 'Export selected JSON' }).addEventListener('click', () => this.exportSelected('json'));
		selectionActions.createEl('button', { text: 'Export selected Markdown' }).addEventListener('click', () => this.exportSelected('markdown'));
		selectionActions.createEl('button', { text: 'Export selected HTML' }).addEventListener('click', () => this.exportSelected('html'));
		selectionActions.createEl('button', { text: 'Archive selected' }).addEventListener('click', () => void this.bulkArchive());
		selectionActions.createEl('button', { text: 'Mark one as duplicate' }).addEventListener('click', () => void this.markSingleDuplicate());

		const count = root.createEl('p', { cls: 'practice-count' });
		const list = root.createDiv({ cls: 'practice-question-list' });

		const filteredQuestions = (): Question[] => {
			const query = search.value.trim().toLocaleLowerCase();
			return bank.filter(
				(x) =>
					(!subject.value || x.subject === subject.value) &&
					(!topic.value || x.topic === topic.value) &&
					(!type.value || x.type === type.value) &&
					(!status.value || (x.status ?? 'active') === status.value) &&
					(!query ||
						`${x.id} ${x.question} ${x.subject} ${x.topic}`
							.toLocaleLowerCase()
							.includes(query)),
			);
		};

		const draw = (): void => {
			list.empty();
			const filtered = filteredQuestions();
			count.setText(`${filtered.length} question(s)`);
			selectionCount.setText(`${this.selection.size()} selected`);

			for (const q of filtered) this.card(list, q, draw);
		};

		search.addEventListener('input', draw);
		subject.addEventListener('change', draw);
		topic.addEventListener('change', draw);
		type.addEventListener('change', draw);
		status.addEventListener('change', draw);
		draw();
	}

	private select(parent: HTMLElement, label: string): HTMLSelectElement {
		const s = parent.createEl('select');
		s.createEl('option', { value: '', text: label });
		return s;
	}

	private card(parent: HTMLElement, q: Question, draw: () => void): void {
		const card = parent.createDiv({ cls: 'practice-question-card' });
		const titleRow = card.createDiv({ cls: 'practice-card-title-row' });
		const checkbox = titleRow.createEl('input', { type: 'checkbox' });
		checkbox.checked = this.selection.isSelected(q.id);
		checkbox.addEventListener('change', () => {
			this.selection.toggle(q.id);
			draw();
		});
		titleRow.createEl('strong', { text: q.question });
		card.createDiv({
			cls: 'practice-question-meta',
			text: `${q.id} · ${q.subject} › ${q.topic} · ${q.type} · difficulty ${q.difficulty} · ${q.status ?? 'active'}`,
		});

		const actions = card.createDiv({ cls: 'practice-card-actions' });
		const edit = actions.createEl('button', { title: 'Edit question', ariaLabel: 'Edit question' });
		setIcon(edit, 'pencil');
		edit.addEventListener('click', () =>
			new QuestionEditModal(this.app, q, async (updated) => {
				await this.plugin.repository.updateQuestion(updated);
				this.render();
			}).open(),
		);

		if (q.status === 'confirmed-duplicate') {
			const clear = actions.createEl('button', { text: 'Unmark duplicate' });
			clear.addEventListener('click', () => {
				void this.plugin.repository
					.clearDuplicate(q.id)
					.then(() => {
						new Notice('Duplicate mark removed.');
						this.render();
					})
					.catch((error) => new Notice(`Could not update question: ${error instanceof Error ? error.message : String(error)}`));
			});
		} else {
			const dup = actions.createEl('button', { text: 'Mark duplicate' });
			dup.addEventListener('click', () => void this.markDuplicateFrom(q));
		}

		const del = actions.createEl('button', { title: 'Delete question', ariaLabel: 'Delete question' });
		setIcon(del, 'trash-2');
		del.addEventListener('click', () => {
			new ConfirmActionModal(
				this.app,
				'Delete question',
				`Permanently delete ${q.id}? This cannot be undone from the plugin.`,
				'Delete',
				async () => {
					await this.plugin.repository.deleteQuestion(q.id);
					this.selection.deselect(q.id);
					new Notice('Question deleted.');
					this.render();
				},
			).open();
		});
	}

	private async markDuplicateFrom(q: Question): Promise<void> {
		const candidates = this.plugin.repository
			.getBank()
			.questions.filter((x) => x.id !== q.id && x.status !== 'confirmed-duplicate');
		if (!candidates.length) {
			new Notice('No other questions are available to mark as the original.');
			return;
		}
		new MarkDuplicateModal(this.app, q, candidates, async (duplicateOf) => {
			await this.plugin.repository.markDuplicate(q.id, duplicateOf);
			this.render();
		}).open();
	}

	private async markSingleDuplicate(): Promise<void> {
		const ids = this.selection.getSelected();
		if (ids.length !== 1) {
			new Notice('Select exactly one question first.');
			return;
		}
		await this.markDuplicateFrom(this.plugin.repository.getQuestion(ids[0])!);
	}

	private async bulkArchive(): Promise<void> {
		const ids = this.selection.getSelected();
		if (!ids.length) {
			new Notice('Select at least one question.');
			return;
		}
		new ConfirmActionModal(
			this.app,
			'Archive selected questions',
			`Archive ${ids.length} question(s)? They will remain in the bank but can be filtered out.`,
			'Archive',
			async () => {
				await this.plugin.repository.archiveQuestions(ids);
				this.selection.clear();
				this.render();
			},
		).open();
	}

	private exportSelected(format: 'json' | 'markdown' | 'html'): void {
		const ids = new Set(this.selection.getSelected());
		if (!ids.size) {
			new Notice('Select at least one question.');
			return;
		}
		const bank = this.plugin.repository.getBank();
		const selected = bank.questions.filter((q) => ids.has(q.id));
		if (format === 'json') exportQuestionsJson(bank, selected);
		else if (format === 'markdown') exportQuestionsMarkdown(bank, selected);
		else exportQuestionsHtml(bank, selected);
		new Notice(`Exported ${selected.length} selected question(s).`);
	}
}