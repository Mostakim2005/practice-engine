import { App, Modal, Notice, Setting } from 'obsidian';
import {
	CognitiveLevel,
	Question,
	QuestionFamily,
	QuestionType,
} from '../types/question';

const QUESTION_TYPES: QuestionType[] = [
	'mcq',
	'multiple-select',
	'true-false',
	'written',
	'numerical',
	'matching',
	'ordering',
	'identification',
	'viva',
	'multi-part',
];

const COGNITIVE_LEVELS: CognitiveLevel[] = [
	'recall',
	'understanding',
	'application',
	'analysis',
	'evaluation',
	'creation',
];

const QUESTION_FAMILIES: QuestionFamily[] = [
	'fact-recall',
	'conceptual',
	'calculation',
	'comparison',
	'interpretation',
	'diagnosis',
	'troubleshooting',
	'scenario',
	'procedure',
	'design-decision',
	'diagram-analysis',
	'data-analysis',
	'identification',
	'sequencing',
	'reasoning',
];

export interface QuestionEditPayload {
	question: Question;
}

export class QuestionEditModal extends Modal {
	private readonly draft: Question;
	private isNew: boolean;

	constructor(
		app: App,
		question: Question | null,
		private readonly saveQuestion: (q: Question) => Promise<void>,
	) {
		super(app);
		this.isNew = !question;
		this.draft =
			structuredClone(question) ??
			({
				id: `DRAFT-${Date.now()}`,
				version: 1,
				type: 'mcq',
				subject: '',
				topic: '',
				difficulty: 1,
				cognitiveLevel: 'recall',
				questionFamily: 'fact-recall',
				question: '',
				options: [
					{ id: 'A', text: '' },
					{ id: 'B', text: '' },
					{ id: 'C', text: '' },
					{ id: 'D', text: '' },
				],
				correctAnswer: ['A'],
				answer: { short: '', model: '' },
				status: 'active',
			} satisfies Question);
	}

	onOpen(): void {
		this.render();
	}

	private render(): void {
		const e = this.contentEl;
		e.empty();
		e.createEl('h2', { text: this.isNew ? 'Create question' : `Edit ${this.draft.id}` });

		new Setting(e)
			.setName('Question ID')
			.setDesc(this.isNew ? 'Use a stable ID; do not use array position.' : 'ID cannot be changed here.')
			.addText((t) => t.setValue(this.draft.id).setDisabled(!this.isNew).onChange((v) => (this.draft.id = v.trim())));

		new Setting(e).setName('Subject').addText((t) => t.setValue(this.draft.subject).onChange((v) => (this.draft.subject = v)));
		new Setting(e).setName('Topic').addText((t) => t.setValue(this.draft.topic).onChange((v) => (this.draft.topic = v)));
		new Setting(e).setName('Subtopic').addText((t) => t.setValue(this.draft.subtopic ?? '').onChange((v) => (this.draft.subtopic = v.trim() || undefined)));

		new Setting(e).setName('Type').addDropdown((d) => {
			for (const value of QUESTION_TYPES) d.addOption(value, value);
			d.setValue(this.draft.type).onChange((v) => {
				this.draft.type = v as QuestionType;
				this.render();
			});
		});

		new Setting(e).setName('Difficulty').addDropdown((d) => {
			for (const value of [1, 2, 3, 4, 5]) d.addOption(String(value), String(value));
			d.setValue(String(this.draft.difficulty)).onChange((v) => {
				this.draft.difficulty = Number(v) as 1 | 2 | 3 | 4 | 5;
			});
		});

		new Setting(e).setName('Cognitive level').addDropdown((d) => {
			for (const value of COGNITIVE_LEVELS) d.addOption(value, value);
			d.setValue(this.draft.cognitiveLevel).onChange((v) => (this.draft.cognitiveLevel = v as CognitiveLevel));
		});

		new Setting(e).setName('Question family').addDropdown((d) => {
			for (const value of QUESTION_FAMILIES) d.addOption(value, value);
			d.setValue(this.draft.questionFamily).onChange((v) => (this.draft.questionFamily = v as QuestionFamily));
		});

		new Setting(e).setName('Question').addTextArea((t) => t.setValue(this.draft.question).onChange((v) => (this.draft.question = v)));

		if (this.draft.options) {
			e.createEl('h3', { text: 'Options' });
			this.draft.options.forEach((option, index) => {
				new Setting(e)
					.setName(`Option ${option.id}`)
					.addText((t) =>
						t
							.setValue(option.text ?? '')
							.onChange((v) => (this.draft.options![index].text = v)),
					)
					.addExtraButton((b) =>
						b.setIcon('trash-2').setTooltip('Remove option').onClick(() => {
							this.draft.options!.splice(index, 1);
							this.render();
						}),
					);
			});
			new Setting(e).addButton((b) =>
				b.setButtonText('Add option').onClick(() => {
					const next = String.fromCharCode(65 + this.draft.options!.length);
					this.draft.options!.push({ id: next, text: '' });
					this.render();
				}),
			);
			new Setting(e).setName('Correct option IDs').addText((t) =>
				t
					.setValue((this.draft.correctAnswer ?? []).join(','))
					.setPlaceholder('A or A,B')
					.onChange((v) => (this.draft.correctAnswer = v.split(',').map((x) => x.trim()).filter(Boolean))),
			);
		}

		new Setting(e).setName('Hint 1').addTextArea((t) => t.setValue(this.draft.hints?.[0] ?? '').onChange((v) => this.setHint(0, v)));
		new Setting(e).setName('Hint 2').addTextArea((t) => t.setValue(this.draft.hints?.[1] ?? '').onChange((v) => this.setHint(1, v)));
		new Setting(e).setName('Short answer').addTextArea((t) => t.setValue(this.draft.answer.short).onChange((v) => (this.draft.answer.short = v)));
		new Setting(e).setName('Model answer').addTextArea((t) => t.setValue(this.draft.answer.model).onChange((v) => (this.draft.answer.model = v)));
		new Setting(e).setName('Explanation').addTextArea((t) => t.setValue(this.draft.answer.explanation ?? '').onChange((v) => (this.draft.answer.explanation = v.trim() || undefined)));
		new Setting(e).setName('Working').addTextArea((t) => t.setValue(this.draft.answer.working ?? '').onChange((v) => (this.draft.answer.working = v.trim() || undefined)));

		new Setting(e)
			.addButton((b) => b.setButtonText('Save question').setCta().onClick(() => void this.save()))
			.addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()));
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
			new Notice('MCQ must have exactly one correct option.');
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

	onClose(): void {
		this.contentEl.empty();
	}
}