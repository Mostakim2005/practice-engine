import { App, Modal, Notice, Setting } from 'obsidian';
import { Question, CognitiveLevel, QuestionFamily, QuestionType } from '../types/question';
import { renderMarkdownContent } from './MarkdownContent';
import type { Component } from 'obsidian';

const QUESTION_TYPES: QuestionType[] = ['mcq', 'multiple-select', 'true-false', 'written', 'numerical', 'matching', 'ordering', 'identification', 'viva', 'multi-part'];
const COGNITIVE_LEVELS: CognitiveLevel[] = ['recall', 'understanding', 'application', 'analysis', 'evaluation', 'creation'];
const QUESTION_FAMILIES: QuestionFamily[] = ['fact-recall', 'conceptual', 'calculation', 'comparison', 'interpretation', 'diagnosis', 'troubleshooting', 'scenario', 'procedure', 'design-decision', 'diagram-analysis', 'data-analysis', 'identification', 'sequencing', 'reasoning'];

export class QuestionEditModal extends Modal {
	private readonly draft: Question;
	private readonly isNew: boolean;
	private previewComponents: Component[] = [];

	constructor(app: App, question: Question | null, private readonly saveQuestion: (q: Question) => Promise<void>) {
		super(app);
		this.isNew = !question;
		this.draft = structuredClone(question) ?? ({
			id: `DRAFT-${Date.now()}`, version: 1, type: 'mcq', subject: '', topic: '', difficulty: 1,
			cognitiveLevel: 'recall', questionFamily: 'fact-recall', question: '',
			options: [{ id: 'A', text: '' }, { id: 'B', text: '' }, { id: 'C', text: '' }, { id: 'D', text: '' }],
			correctAnswer: ['A'], answer: { short: '', model: '' }, status: 'active',
		} satisfies Question);
	}

	onOpen(): void { this.render(); }
	onClose(): void { this.cleanupPreviews(); this.contentEl.empty(); }

	private render(): void {
		this.cleanupPreviews();
		const e = this.contentEl;
		e.empty();
		e.addClass('practice-question-edit-modal');
		e.createEl('h2', { text: this.isNew ? 'Create question' : `Edit ${this.draft.id}` });

		this.textField(e, 'Question ID', this.draft.id, (v) => (this.draft.id = v.trim()), !this.isNew);
		this.textField(e, 'Subject', this.draft.subject, (v) => { this.draft.subject = v; });
		this.textField(e, 'Topic', this.draft.topic, (v) => { this.draft.topic = v; });
		this.textField(e, 'Subtopic', this.draft.subtopic ?? '', (v) => { this.draft.subtopic = v.trim() || undefined; });

		this.dropdown(e, 'Type', QUESTION_TYPES, this.draft.type, (v) => { this.draft.type = v as QuestionType; this.render(); });
		this.dropdown(e, 'Difficulty', [1, 2, 3, 4, 5].map(String), String(this.draft.difficulty), (v) => { this.draft.difficulty = Number(v) as 1 | 2 | 3 | 4 | 5; });
		this.dropdown(e, 'Cognitive level', COGNITIVE_LEVELS, this.draft.cognitiveLevel, (v) => { this.draft.cognitiveLevel = v as CognitiveLevel; });
		this.dropdown(e, 'Question family', QUESTION_FAMILIES, this.draft.questionFamily, (v) => { this.draft.questionFamily = v as QuestionFamily; });

		this.largeTextField(e, 'Question', 'Write the question. Markdown and math are supported.', this.draft.question, (v) => { this.draft.question = v; }, true);
		this.renderPreview(e, 'Question preview', this.draft.question);

		if (this.draft.options) {
			e.createEl('h3', { text: 'Options' });
			this.draft.options.forEach((option, index) => {
				this.largeTextField(e, `Option ${option.id}`, 'Markdown and math supported.', option.text, (v) => { option.text = v; }, false, true, () => {
					this.draft.options?.splice(index, 1);
					this.render();
				});
			});
			new Setting(e).addButton((b) => b.setButtonText('Add option').onClick(() => {
				const next = String.fromCharCode(65 + (this.draft.options?.length ?? 0));
				this.draft.options?.push({ id: next, text: '' });
				this.render();
			}));
			this.textField(e, 'Correct option IDs', (this.draft.correctAnswer ?? []).join(','), (v) => {
				this.draft.correctAnswer = v.split(',').map((x) => x.trim()).filter(Boolean);
			});
		}

		this.largeTextField(e, 'Hint 1', 'Optional hint.', this.draft.hints?.[0] ?? '', (v) => this.setHint(0, v));
		this.largeTextField(e, 'Hint 2', 'Optional hint.', this.draft.hints?.[1] ?? '', (v) => this.setHint(1, v));
		this.largeTextField(e, 'Short answer', 'Required. Concise expected result.', this.draft.answer.short, (v) => { this.draft.answer.short = v; });
		this.largeTextField(e, 'Model answer', 'Required. Full answer.', this.draft.answer.model, (v) => { this.draft.answer.model = v; }, true);
		this.renderPreview(e, 'Model answer preview', this.draft.answer.model);
		this.largeTextField(e, 'Explanation', 'Optional explanation.', this.draft.answer.explanation ?? '', (v) => { this.draft.answer.explanation = v.trim() || undefined; }, true);
		this.largeTextField(e, 'Working', 'Optional calculations or solution steps.', this.draft.answer.working ?? '', (v) => { this.draft.answer.working = v.trim() || undefined; }, true);

		new Setting(e)
			.addButton((b) => b.setButtonText('Save question').setCta().onClick(() => void this.save()))
			.addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()));
	}

	private textField(parent: HTMLElement, name: string, value: string, onChange: (value: string) => void, disabled = false): void {
		new Setting(parent).setName(name).addText((t) => t.setValue(value).setDisabled(disabled).onChange(onChange));
	}

	private dropdown(parent: HTMLElement, name: string, values: string[], value: string, onChange: (value: string) => void): void {
		new Setting(parent).setName(name).addDropdown((d) => { for (const item of values) d.addOption(item, item); d.setValue(value).onChange(onChange); });
	}

	private largeTextField(parent: HTMLElement, name: string, desc: string, value: string, onChange: (value: string) => void, previewable = false, removable = false, remove?: () => void): void {
		const setting = new Setting(parent).setName(name).setDesc(desc);
		const textarea = setting.controlEl.createEl('textarea');
		textarea.value = value;
		textarea.rows = 6;
		textarea.className = 'practice-large-textarea';
		textarea.addEventListener('input', () => onChange(textarea.value));
		if (removable && remove) setting.addExtraButton((b) => b.setIcon('trash-2').setTooltip('Remove').onClick(remove));
		if (previewable) {
			const preview = parent.createDiv({ cls: 'practice-editor-preview' });
			preview.createEl('small', { text: 'Live preview' });
			const content = preview.createDiv({ cls: 'practice-rendered-content' });
			void this.renderPreviewContent(value, content);
			textarea.addEventListener('input', () => void this.renderPreviewContent(textarea.value, content));
		}
	}

	private renderPreview(parent: HTMLElement, heading: string, markdown: string): void {
		const preview = parent.createDiv({ cls: 'practice-editor-preview' });
		preview.createEl('small', { text: heading });
		const content = preview.createDiv({ cls: 'practice-rendered-content' });
		void this.renderPreviewContent(markdown, content);
	}

	private async renderPreviewContent(markdown: string, container: HTMLElement): Promise<void> {
		try {
			const component = await renderMarkdownContent(this.app, markdown, container, this.app.vault.getName());
			this.previewComponents.push(component);
		} catch {
			container.empty();
			container.createEl('pre', { text: markdown });
			container.addClass('practice-render-error');
		}
	}

	private setHint(index: number, value: string): void {
		const hints = [...(this.draft.hints ?? [])];
		while (hints.length <= index) hints.push('');
		hints[index] = value;
		this.draft.hints = hints.filter((x) => x.trim());
	}

	private async save(): Promise<void> {
		const q = structuredClone(this.draft);
		if (!q.id || !q.subject || !q.topic || !q.question || !q.answer.short || !q.answer.model) {
			new Notice('ID, subject, topic, question, short answer, and model answer are required.');
			return;
		}
		if (q.type === 'mcq' && q.correctAnswer?.length !== 1) {
			new Notice('Mcq must have exactly one correct option.');
			return;
		}
		q.updatedAt = new Date().toISOString();
		if (!q.createdAt) q.createdAt = new Date().toISOString();
		try {
			await this.saveQuestion(q);
			new Notice(this.isNew ? 'Question created.' : 'Question saved.');
			this.close();
		} catch (error) {
			new Notice(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private cleanupPreviews(): void {
		for (const component of this.previewComponents) component.unload();
		this.previewComponents = [];
	}
}
