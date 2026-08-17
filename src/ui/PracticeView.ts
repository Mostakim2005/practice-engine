import { ItemView, Notice, Setting, WorkspaceLeaf } from 'obsidian';
import type PracticePlugin from '../main';
import { PracticeEngine } from '../engine/PracticeEngine';
import { PracticeFilters } from '../types/attempt';
import { CognitiveLevel, QuestionFamily, QuestionType } from '../types/question';

export const PRACTICE_VIEW_TYPE = 'practice-engine-practice';

export class PracticeView extends ItemView {
	private engine: PracticeEngine;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: PracticePlugin) {
		super(leaf);
		this.engine = new PracticeEngine(this.plugin.repository, this.plugin.attempts);
	}

	getViewType(): string {
		return PRACTICE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Practice';
	}

	getIcon(): string {
		return 'graduation-cap';
	}

	onOpen(): Promise<void> {
		this.renderSetup();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		return Promise.resolve();
	}

	renderSetup(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('practice-engine-view');
		root.createEl('h2', { text: 'Practice' });
		root.createEl('p', {
			text: 'Choose a structured practice set. Selection remains replaceable so the future Caesar engine can use the same filters and candidate set.',
		});

		const taxonomy = this.plugin.repository.getTaxonomy();
		const filters: PracticeFilters = {};
		const maxQuestions = { value: 10 };

		const subject = this.addSelect(root, 'Subject', 'All subjects', taxonomy.subjects, (value) => {
			filters.subject = value || undefined;
			this.refreshDependentTopicSelectors(root, filters);
		});
		const topic = this.addSelect(root, 'Topic', 'All topics', taxonomy.topics, (value) => {
			filters.topic = value || undefined;
			this.refreshDependentSubtopicSelectors(root, filters);
		});
		const subtopic = this.addSelect(root, 'Subtopic', 'All subtopics', taxonomy.subtopics, (value) => {
			filters.subtopic = value || undefined;
		});

		const concept = this.addSelect(root, 'Knowledge concept', 'All concepts', taxonomy.knowledgeConcepts, (value) => {
			filters.knowledgeConcepts = value ? [value] : undefined;
		});
		const application = this.addSelect(root, 'Application domain', 'All application domains', taxonomy.applicationDomains, (value) => {
			filters.applicationDomains = value ? [value] : undefined;
		});
		const cognitive = this.addSelect(root, 'Cognitive level', 'All levels', taxonomy.cognitiveLevels, (value) => {
			filters.cognitiveLevels = value ? [value as CognitiveLevel] : undefined;
		});
		const family = this.addSelect(root, 'Question family', 'All families', taxonomy.questionFamilies, (value) => {
			filters.questionFamilies = value ? [value as QuestionFamily] : undefined;
		});
		const type = this.addSelect(root, 'Question type', 'All types', taxonomy.types, (value) => {
			filters.types = value ? [value as QuestionType] : undefined;
		});
		const difficulty = this.addSelect(root, 'Difficulty', 'All difficulties', taxonomy.difficulties.map(String), (value) => {
			filters.difficulties = value ? [Number(value)] : undefined;
		});

		new Setting(root)
			.setName('Questions')
			.setDesc('Number of questions in this session.')
			.addText((t) =>
				t.setValue(String(maxQuestions.value)).onChange((v) => {
					const parsed = Number(v);
					if (Number.isFinite(parsed) && parsed > 0) maxQuestions.value = Math.min(100, Math.floor(parsed));
				}),
			);

		new Setting(root)
			.addButton((b) =>
				b.setButtonText('Start practice').setCta().onClick(() => void this.start(maxQuestions.value, filters)),
			);

		void subject;
		void topic;
		void subtopic;
		void concept;
		void application;
		void cognitive;
		void family;
		void type;
		void difficulty;
	}

	private addSelect(
		root: HTMLElement,
		label: string,
		allLabel: string,
		values: string[],
		onChange: (value: string) => void,
	): HTMLSelectElement {
		const setting = new Setting(root).setName(label);
		const select = setting.controlEl.createEl('select');
		select.createEl('option', { value: '', text: allLabel });
		for (const value of values) {
			select.createEl('option', { value, text: value });
		}
		select.addEventListener('change', () => onChange(select.value));
		setting.controlEl.appendChild(select);
		return select;
	}

	private refreshDependentTopicSelectors(root: HTMLElement, filters: PracticeFilters): void {
		void root;
		void filters;
		// Phase 4 keeps filtering data-driven while leaving the selector UI stable.
		// Topic/subtopic dependency refinement will be expanded with the future taxonomy UI.
	}

	private refreshDependentSubtopicSelectors(root: HTMLElement, filters: PracticeFilters): void {
		void root;
		void filters;
	}

	private async start(maxQuestions: number, filters: PracticeFilters): Promise<void> {
		const candidateCount = this.plugin.repository.queryQuestions({
			...filters,
			statuses: ['active'],
		}).length;

		if (!candidateCount) {
			new Notice('No active questions match those filters.');
			return;
		}

		const session = await this.engine.startSession(filters, {
			maxQuestions: Math.min(maxQuestions, candidateCount),
			allowRepeat: false,
		});
		if (!session) {
			new Notice('Could not create a practice session.');
			return;
		}
		await this.renderQuestion();
	}

	private async renderQuestion(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		const q = this.engine.getCurrentQuestion();
		if (!q) {
			this.renderSummary();
			return;
		}

		const session = this.engine.getSession();
		root.createEl('p', {
			text: `Question ${(session?.currentIndex ?? 0) + 1} of ${session?.questionIds.length ?? 0}`,
		});
		root.createEl('div', { text: `${q.subject} › ${q.topic} · ${q.type} · difficulty ${q.difficulty}` });
		root.createEl('h2', { text: q.question });

		const feedback = root.createDiv();

		if (q.type === 'mcq' || q.type === 'multiple-select') {
			const optionInputs: HTMLInputElement[] = [];
			for (const option of q.options ?? []) {
				const label = root.createEl('label');
				const input = label.createEl('input', { type: q.type === 'mcq' ? 'radio' : 'checkbox' });
				input.name = 'practice-answer';
				input.value = option.id;
				optionInputs.push(input);
				label.appendText(` ${option.id}. ${option.text}`);
			}

			new Setting(root)
				.setName('Confidence')
				.setDesc('How confident were you before seeing the result? 1–5.')
				.addDropdown((d) => {
					for (let i = 1; i <= 5; i++) d.addOption(String(i), String(i));
					d.setValue('3');
				})
				.addButton((b) =>
					b.setButtonText('Submit answer').setCta().onClick(() => {
						const selected = optionInputs.filter((x) => x.checked).map((x) => x.value);
						if (!selected.length) {
							new Notice('Select an answer first.');
							return;
						}
						const select = root.querySelector('select');
						const confidence = select instanceof HTMLSelectElement ? Number(select.value) : 3;
						void this.submitResponse(selected, confidence, feedback);
					}),
				);
		} else {
			root.createEl('textarea', { placeholder: 'Type your answer here…' });
			root.createEl('h3', { text: 'Hints' });
			const hints = q.hints ?? [];
			if (!hints.length) {
				root.createEl('p', { text: 'No hints available.' });
			} else {
				for (let i = 0; i < hints.length; i++) {
					new Setting(root)
						.setName(`Hint ${i + 1}`)
						.addButton((b) => b.setButtonText(`Reveal hint ${i + 1}`).onClick(() => {
							this.engine.useHint(i + 1);
							root.createEl('p', { text: hints[i] ?? '' });
						}));
				}
			}
			new Setting(root)
				.setName('Self-assessment')
				.setDesc('After comparing with the model answer, record your own assessment.')
				.addButton((b) => b.setButtonText('Reveal model answer').onClick(() => {
					feedback.empty();
					feedback.createEl('h3', { text: 'Model answer' });
					feedback.createEl('p', { text: q.answer.model });
					if (q.answer.explanation) feedback.createEl('p', { text: q.answer.explanation });
				}))
				.addButton((b) => b.setButtonText('Correct').onClick(() => void this.submitOpenResponse('correct', feedback)))
				.addButton((b) => b.setButtonText('Partial').onClick(() => void this.submitOpenResponse('partial', feedback)))
				.addButton((b) => b.setButtonText('Incorrect').onClick(() => void this.submitOpenResponse('incorrect', feedback)));
		}

		if ((q.type === 'mcq' || q.type === 'multiple-select') && q.hints?.length) {
			root.createEl('h3', { text: 'Hints' });
			q.hints.forEach((hint, index) => {
				new Setting(root)
					.setName(`Hint ${index + 1}`)
					.addButton((b) => b.setButtonText(`Reveal hint ${index + 1}`).onClick(() => {
						this.engine.useHint(index + 1);
						feedback.createEl('p', { text: hint });
					}));
			});
		}
	}

	private async submitResponse(response: unknown, confidence: number, feedback: HTMLElement): Promise<void> {
		const event = await this.engine.answer(response, confidence);
		if (!event) return;
		feedback.empty();
		feedback.createEl('strong', { text: event.result === 'correct' ? 'Correct' : 'Incorrect' });
		const next = feedback.createEl('button', { text: 'Next question' });
		next.addEventListener('click', () => void this.advance());
	}

	private async submitOpenResponse(result: 'correct' | 'partial' | 'incorrect', feedback: HTMLElement): Promise<void> {
		const textarea = this.contentEl.querySelector('textarea');
		const event = await this.engine.answer(
			textarea instanceof HTMLTextAreaElement ? textarea.value : '',
			3,
			result,
		);
		if (!event) return;
		feedback.empty();
		feedback.createEl('strong', { text: `Recorded as ${result}.` });
		const next = feedback.createEl('button', { text: 'Next question' });
		next.addEventListener('click', () => void this.advance());
	}

	private async advance(): Promise<void> {
		await this.engine.nextQuestion();
		await this.renderQuestion();
	}

	private renderSummary(): void {
		const root = this.contentEl;
		root.empty();
		root.createEl('h2', { text: 'Practice complete' });
		root.createEl('p', { text: 'Your attempt evidence has been saved locally.' });
		new Setting(root).addButton((b) => b.setButtonText('Start another session').onClick(() => this.renderSetup()));
	}
}
