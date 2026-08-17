import { ItemView, Notice, Setting, WorkspaceLeaf } from 'obsidian';
import type PracticePlugin from '../main';
import { PracticeEngine } from '../engine/PracticeEngine';

export const PRACTICE_VIEW_TYPE = 'practice-engine-practice';

export class PracticeView extends ItemView {
	private engine: PracticeEngine;
	private readonly root = this.contentEl;

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
		this.root.empty();
		this.root.addClass('practice-engine-view');
		this.root.createEl('h2', { text: 'Practice' });
		this.root.createEl('p', {
			text: 'Start a practice session. The current strategy is intentionally simple and replaceable by the future Caesar engine.',
		});

		const maxQuestions = { value: 10 };
		new Setting(this.root)
			.setName('Questions')
			.setDesc('Number of questions in this session.')
			.addText((t) =>
				t.setValue(String(maxQuestions.value)).onChange((v) => {
					const parsed = Number(v);
					if (Number.isFinite(parsed) && parsed > 0) maxQuestions.value = Math.min(100, Math.floor(parsed));
				}),
			);

		new Setting(this.root)
			.addButton((b) => b.setButtonText('Start practice').setCta().onClick(() => void this.start(maxQuestions.value)));
	}

	private async start(maxQuestions: number): Promise<void> {
		const session = await this.engine.startSession(undefined, { maxQuestions, allowRepeat: false });
		if (!session) {
			new Notice('Could not create a practice session.');
			return;
		}
		await this.renderQuestion();
	}

	private async renderQuestion(): Promise<void> {
		const q = this.engine.getCurrentQuestion();
		this.root.empty();
		if (!q) {
			this.renderSummary();
			return;
		}
		const session = this.engine.getSession();
		this.root.createEl('p', { text: `Question ${(session?.currentIndex ?? 0) + 1} of ${session?.questionIds.length ?? 0}` });
		this.root.createEl('div', { text: `${q.subject} › ${q.topic} · ${q.type} · difficulty ${q.difficulty}` });
		this.root.createEl('h2', { text: q.question });

		const feedback = this.root.createDiv();

		if (q.type === 'mcq' || q.type === 'multiple-select') {
			const correctCount = q.type === 'mcq' ? 1 : undefined;
			const optionInputs: HTMLInputElement[] = [];
			for (const option of q.options ?? []) {
				const label = this.root.createEl('label');
				const input = label.createEl('input', { type: q.type === 'mcq' ? 'radio' : 'checkbox' });
				input.name = 'practice-answer';
				input.value = option.id;
				optionInputs.push(input);
				label.appendText(` ${option.id}. ${option.text}`);
				label.appendText(' ');
			}

			new Setting(this.root)
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
						if (q.type === 'mcq' && selected.length !== correctCount) return;
						void this.submitResponse(selected, Number((this.root.querySelector('select') as HTMLSelectElement)?.value ?? 3), feedback);
					}),
				);
		} else {
			this.root.createEl('textarea', { placeholder: 'Type your answer here…' });
			this.root.createEl('h3', { text: 'Hints' });
			const hints = q.hints ?? [];
			if (!hints.length) {
				this.root.createEl('p', { text: 'No hints available.' });
			} else {
				for (let i = 0; i < hints.length; i++) {
					new Setting(this.root)
						.setName(`Hint ${i + 1}`)
						.addButton((b) => b.setButtonText(`Reveal hint ${i + 1}`).onClick(() => {
							this.engine.useHint(i + 1);
							this.root.createEl('p', { text: hints[i] ?? '' });
						}));
				}
			}
			new Setting(this.root)
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
			this.root.createEl('h3', { text: 'Hints' });
			q.hints.forEach((hint, index) => {
				new Setting(this.root)
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
		const textarea = this.root.querySelector('textarea');
		const event = await this.engine.answer(textarea instanceof HTMLTextAreaElement ? textarea.value : '', 3, result);
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
		this.root.empty();
		this.root.createEl('h2', { text: 'Practice complete' });
		this.root.createEl('p', { text: 'Your attempt evidence has been saved locally.' });
		new Setting(this.root).addButton((b) => b.setButtonText('Start another session').onClick(() => this.renderSetup()));
	}
}
