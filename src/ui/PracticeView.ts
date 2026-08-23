import { ItemView, Notice, Setting, WorkspaceLeaf } from 'obsidian';
import type PracticePlugin from '../main';
import { PracticeEngine } from '../engine/PracticeEngine';
import { PracticeFilters } from '../types/attempt';
import { CognitiveLevel, QuestionFamily, QuestionType, Question } from '../types/question';
import { renderMarkdownContent } from './MarkdownContent';
import type { Component } from 'obsidian';

export const PRACTICE_VIEW_TYPE = 'practice-engine-practice';

type FilterKey = 'subject' | 'topic' | 'subtopic' | 'knowledgeConcepts' | 'applicationDomains' | 'cognitiveLevels' | 'questionFamilies' | 'types' | 'difficulties';

export class PracticeView extends ItemView {
	private engine: PracticeEngine;
	private markdownComponents: Component[] = [];
	private filters: PracticeFilters = {};
	private maxQuestions = 10;
	private activeSetup?: { root: HTMLElement; selects: Map<FilterKey, HTMLSelectElement>; count: HTMLElement };

	constructor(leaf: WorkspaceLeaf, private readonly plugin: PracticePlugin) {
		super(leaf);
		this.engine = new PracticeEngine(this.plugin.repository, this.plugin.attempts);
	}

	getViewType(): string { return PRACTICE_VIEW_TYPE; }
	getDisplayText(): string { return 'Practice'; }
	getIcon(): string { return 'graduation-cap'; }

	onOpen(): Promise<void> {
		this.renderSetup();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.cleanupMarkdown();
		return Promise.resolve();
	}

	startWithFilters(filters: PracticeFilters): void {
		this.filters = structuredClone(filters);
		this.renderSetup();
	}

	renderSetup(): void {
		this.cleanupMarkdown();
		const root = this.contentEl;
		root.empty();
		root.addClass('practice-engine-view', 'practice-setup-view');

		const header = root.createDiv({ cls: 'practice-page-header' });
		const title = header.createDiv();
		title.createEl('h2', { text: 'Start practice' });
		title.createEl('p', { cls: 'practice-muted', text: 'Choose a focused set. Filters update each other automatically.' });
		const headerActions = header.createDiv({ cls: 'practice-header-actions' });
		const sidebar = headerActions.createEl('button', { text: 'Open sidebar' });
		sidebar.addEventListener('click', () => void this.plugin.activateSidebarView());
		const progress = headerActions.createEl('button', { text: 'View progress' });
		progress.addEventListener('click', () => void this.plugin.activateProgressView());

		const taxonomy = this.plugin.repository.getTaxonomy();
		const grid = root.createDiv({ cls: 'practice-filter-grid' });
		const selects = new Map<FilterKey, HTMLSelectElement>();
		const add = (key: FilterKey, label: string, values: string[], value?: string): HTMLSelectElement => {
			const wrap = grid.createDiv({ cls: 'practice-filter-field' });
			wrap.createEl('label', { text: label });
			const select = wrap.createEl('select');
			select.dataset.filterKey = key;
			select.appendChild(new Option(`All ${label.toLocaleLowerCase()}`, ''));
			for (const item of values) select.appendChild(new Option(item, item));
			select.value = value ?? '';
			select.addEventListener('change', () => {
				this.applySetupSelection(selects);
				this.refreshSetupSelectors(selects);
			});
			selects.set(key, select);
			return select;
		};

		add('subject', 'Subject', taxonomy.subjects, this.filters.subject);
		add('topic', 'Topic', taxonomy.topics, this.filters.topic);
		add('subtopic', 'Subtopic', taxonomy.subtopics, this.filters.subtopic);
		add('knowledgeConcepts', 'Concept', taxonomy.knowledgeConcepts, this.filters.knowledgeConcepts?.[0]);
		add('applicationDomains', 'Application domain', taxonomy.applicationDomains, this.filters.applicationDomains?.[0]);
		add('cognitiveLevels', 'Cognitive level', taxonomy.cognitiveLevels, this.filters.cognitiveLevels?.[0]);
		add('questionFamilies', 'Question family', taxonomy.questionFamilies, this.filters.questionFamilies?.[0]);
		add('types', 'Question type', taxonomy.types, this.filters.types?.[0]);
		add('difficulties', 'Difficulty', taxonomy.difficulties.map(String), this.filters.difficulties?.[0] === undefined ? undefined : String(this.filters.difficulties[0]));

		const meta = root.createDiv({ cls: 'practice-filter-meta' });
		const count = meta.createSpan({ text: '0 matching active questions' });
		const reset = meta.createEl('button', { text: 'Clear filters' });
		reset.addEventListener('click', () => {
			this.filters = {};
			for (const select of selects.values()) select.value = '';
			this.refreshSetupSelectors(selects);
			this.updateCandidateCount(count);
		});

		new Setting(root)
			.setName('Questions per session')
			.setDesc('Choose how many questions to attempt, up to 100.')
			.addText((text) => text
				.setValue(String(this.maxQuestions))
				.setPlaceholder('10')
				.onChange((value) => {
					const n = Number(value);
					if (Number.isFinite(n) && n > 0) this.maxQuestions = Math.min(100, Math.floor(n));
				}),
			);

		const start = root.createEl('button', { text: 'Start practice', cls: 'practice-primary-button' });
		start.addEventListener('click', () => void this.start());

		this.activeSetup = { root, selects, count };
		this.refreshSetupSelectors(selects);
	}

	private applySetupSelection(selects: Map<FilterKey, HTMLSelectElement>): void {
		const subject = selects.get('subject')?.value || undefined;
		const topic = selects.get('topic')?.value || undefined;
		const subtopic = selects.get('subtopic')?.value || undefined;
		this.filters.subject = subject;
		this.filters.topic = topic;
		this.filters.subtopic = subtopic;
		this.filters.knowledgeConcepts = this.optionalArray(selects.get('knowledgeConcepts')?.value);
		this.filters.applicationDomains = this.optionalArray(selects.get('applicationDomains')?.value);
		this.filters.cognitiveLevels = this.optionalArray(selects.get('cognitiveLevels')?.value) as CognitiveLevel[] | undefined;
		this.filters.questionFamilies = this.optionalArray(selects.get('questionFamilies')?.value) as QuestionFamily[] | undefined;
		this.filters.types = this.optionalArray(selects.get('types')?.value) as QuestionType[] | undefined;
		const difficulty = selects.get('difficulties')?.value;
		this.filters.difficulties = difficulty ? [Number(difficulty)] : undefined;
	}

	private optionalArray<T>(value?: T): T[] | undefined { return value ? [value] : undefined; }

	private refreshSetupSelectors(selects: Map<FilterKey, HTMLSelectElement>): void {
		this.applySetupSelection(selects);
		const bank = this.plugin.repository.getBank().questions;
		const selectedSubject = this.filters.subject;
		const base = bank.filter((q) => (q.status ?? 'active') === 'active');
		const selectedSubjectQuestions = selectedSubject ? base.filter((q) => q.subject === selectedSubject) : base;
		const relatedIds = new Set<string>();
		for (const q of selectedSubjectQuestions) {
			for (const id of [
				...(q.relationships?.related ?? []),
				...(q.relationships?.prerequisites ?? []),
				...(q.relationships?.followUps ?? []),
				...(q.relationships?.contrastsWith ?? []),
				...(q.relationships?.harderVersions ?? []),
				...(q.relationships?.easierVersions ?? []),
			]) relatedIds.add(id);
		}
		const scoped = selectedSubject
			? base.filter((q) => q.subject === selectedSubject || relatedIds.has(q.id))
			: base;
		const scope = (key: FilterKey): Question[] => {
			const withoutOwn = scoped.filter((q) => {
				if (key !== 'subject' && this.filters.subject && q.subject !== this.filters.subject && !relatedIds.has(q.id)) return false;
				if (key !== 'topic' && this.filters.topic && q.topic !== this.filters.topic) return false;
				if (key !== 'subtopic' && this.filters.subtopic && q.subtopic !== this.filters.subtopic) return false;
				if (key !== 'knowledgeConcepts' && this.filters.knowledgeConcepts?.length && !this.filters.knowledgeConcepts.every((x) => q.knowledgeConcepts?.includes(x))) return false;
				if (key !== 'applicationDomains' && this.filters.applicationDomains?.length && !this.filters.applicationDomains.every((x) => q.applicationDomains?.includes(x))) return false;
				if (key !== 'cognitiveLevels' && this.filters.cognitiveLevels?.length && !this.filters.cognitiveLevels.includes(q.cognitiveLevel)) return false;
				if (key !== 'questionFamilies' && this.filters.questionFamilies?.length && !this.filters.questionFamilies.includes(q.questionFamily)) return false;
				if (key !== 'types' && this.filters.types?.length && !this.filters.types.includes(q.type)) return false;
				if (key !== 'difficulties' && this.filters.difficulties?.length && !this.filters.difficulties.includes(q.difficulty)) return false;
				return true;
			});
			return withoutOwn;
		};
		const valuesFor = (key: FilterKey): string[] => {
			const qs = scope(key);
			switch (key) {
				case 'subject': return this.unique(qs.map((q) => q.subject));
				case 'topic': return this.unique(qs.map((q) => q.topic));
				case 'subtopic': return this.unique(qs.map((q) => q.subtopic ?? ''));
				case 'knowledgeConcepts': return this.unique(qs.flatMap((q) => q.knowledgeConcepts ?? []));
				case 'applicationDomains': return this.unique(qs.flatMap((q) => q.applicationDomains ?? []));
				case 'cognitiveLevels': return this.unique(qs.map((q) => q.cognitiveLevel));
				case 'questionFamilies': return this.unique(qs.map((q) => q.questionFamily));
				case 'types': return this.unique(qs.map((q) => q.type));
				case 'difficulties': return [...new Set(qs.map((q) => q.difficulty))].sort((a, b) => a - b).map(String);
			}
		};
		for (const [key, select] of selects) {
			const current = select.value;
			const values = valuesFor(key);
			select.empty();
			select.appendChild(new Option(`All ${select.dataset.filterKey === 'types' ? 'question types' : key === 'cognitiveLevels' ? 'cognitive levels' : key.replace(/([A-Z])/g, ' $1').toLowerCase()}`, ''));
			for (const value of values) select.appendChild(new Option(value, value));
			if (current && values.includes(current)) select.value = current;
			else {
				select.value = '';
				if (current) this.clearFilter(key);
			}
		}
		this.applySetupSelection(selects);
		this.updateCandidateCount(this.activeSetup?.count);
	}

	private clearFilter(key: FilterKey): void {
		switch (key) {
			case 'subject': delete this.filters.subject; break;
			case 'topic': delete this.filters.topic; break;
			case 'subtopic': delete this.filters.subtopic; break;
			case 'knowledgeConcepts': delete this.filters.knowledgeConcepts; break;
			case 'applicationDomains': delete this.filters.applicationDomains; break;
			case 'cognitiveLevels': delete this.filters.cognitiveLevels; break;
			case 'questionFamilies': delete this.filters.questionFamilies; break;
			case 'types': delete this.filters.types; break;
			case 'difficulties': delete this.filters.difficulties; break;
		}
	}

	private updateCandidateCount(target?: HTMLElement): void {
		if (!target) return;
		const count = this.plugin.repository.queryQuestions({ ...this.filters, statuses: ['active'] }).length;
		target.setText(`${count} matching active question${count === 1 ? '' : 's'}`);
	}

	private unique(values: string[]): string[] {
		return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
	}

	private async start(): Promise<void> {
		const candidateCount = this.plugin.repository.queryQuestions({ ...this.filters, statuses: ['active'] }).length;
		if (!candidateCount) {
			new Notice('No active questions match those filters.');
			return;
		}
		const session = await this.engine.startSession(this.filters, {
			maxQuestions: Math.min(this.maxQuestions, candidateCount),
			allowRepeat: false,
		});
		if (!session) {
			new Notice('Could not create a practice session.');
			return;
		}
		await this.renderQuestion();
	}

	private async renderQuestion(): Promise<void> {
		this.cleanupMarkdown();
		const root = this.contentEl;
		root.empty();
		root.addClass('practice-engine-view', 'practice-question-view');
		const q = this.engine.getCurrentQuestion();
		const session = this.engine.getSession();
		if (!q || !session) {
			this.renderSummary();
			return;
		}
		const header = root.createDiv({ cls: 'practice-question-header' });
		header.createSpan({ cls: 'practice-progress-pill', text: `${session.currentIndex + 1} / ${session.maxQuestions ?? session.questionIds.length}` });
		const meta = header.createSpan({ cls: 'practice-muted', text: `${q.subject} › ${q.topic} · ${q.type} · difficulty ${q.difficulty}` });
		meta.setAttr('title', q.id);

		if (this.engine.getCurrentSelectionStrategy().startsWith('caesar-')) {
			const explain = root.createDiv({ cls: 'caesar-decision-summary' });
			explain.createEl('strong', { text: 'CAESAR adaptive' });
			const factors = this.engine.getCurrentSelectionFactors();
			const reason = factors.find((factor) => factor.includes('Phase=') || factor.includes('Phase:'));
			if (reason) explain.createSpan({ text: reason });
			const details = explain.createEl('details');
			details.createEl('summary', { text: 'Why this question?' });
			for (const factor of factors) details.createDiv({ text: factor });
		}

		const questionBlock = root.createDiv({ cls: 'practice-rendered-content practice-question-content' });
		await this.renderContent(q.question, questionBlock);

		const feedback = root.createDiv({ cls: 'practice-feedback' });
		const answerArea = root.createDiv({ cls: 'practice-answer-area' });
		if (q.type === 'mcq' || q.type === 'multiple-select') {
			const optionInputs: HTMLInputElement[] = [];
			const optionsBlock = answerArea.createDiv({ cls: 'practice-options' });
			for (const option of q.options ?? []) {
				const label = optionsBlock.createEl('label', { cls: 'practice-option' });
				const input = label.createEl('input', { type: q.type === 'mcq' ? 'radio' : 'checkbox' });
				input.name = 'practice-answer';
				input.value = option.id;
				optionInputs.push(input);
				const optionText = label.createDiv({ cls: 'practice-rendered-content' });
				await this.renderContent(`${option.id}. ${option.text}`, optionText);
			}
			new Setting(answerArea).setName('Confidence').setDesc('How confident were you before seeing the result?')
				.addDropdown((d) => { for (let i = 1; i <= 5; i++) d.addOption(String(i), String(i)); d.setValue('3'); })
				.addButton((b) => b.setButtonText('Submit answer').setCta().onClick(() => {
					const selected = optionInputs.filter((x) => x.checked).map((x) => x.value);
					if (!selected.length) { new Notice('Select an answer first.'); return; }
					const select = answerArea.querySelector('select');
					const confidence = select instanceof HTMLSelectElement ? Number(select.value) : 3;
					void this.submitResponse(selected, confidence, feedback);
				}));
		} else {
			const textarea = answerArea.createEl('textarea', { cls: 'practice-answer-input', placeholder: 'Type your answer here…' });
			textarea.rows = 7;
			this.renderHints(answerArea, q, feedback);
			const controls = new Setting(answerArea).setName('Self-assessment').setDesc('Reveal the model answer, then record your assessment.');
			controls.addButton((b) => b.setButtonText('Reveal answer').onClick(() => void this.revealAnswer(q, feedback)));
			controls.addButton((b) => b.setButtonText('Correct').onClick(() => void this.submitOpenResponse('correct', feedback)));
			controls.addButton((b) => b.setButtonText('Partial').onClick(() => void this.submitOpenResponse('partial', feedback)));
			controls.addButton((b) => b.setButtonText('Incorrect').onClick(() => void this.submitOpenResponse('incorrect', feedback)));
			void textarea;
		}
		if ((q.type === 'mcq' || q.type === 'multiple-select')) this.renderHints(answerArea, q, feedback);
	}

	private renderHints(parent: HTMLElement, q: Question, feedback: HTMLElement): void {
		const hints = q.hints ?? [];
		const wrap = parent.createDiv({ cls: 'practice-reveal-area' });
		wrap.createEl('h3', { text: 'Hints' });
		if (!hints.length) wrap.createEl('p', { cls: 'practice-muted', text: 'No hints available.' });
		for (let i = 0; i < hints.length; i++) {
			const item = wrap.createDiv({ cls: 'practice-hint-item' });
			const button = item.createEl('button', { text: `Reveal hint ${i + 1}` });
			button.addEventListener('click', () => {
				this.engine.useHint(i + 1);
				button.disabled = true;
				const content = item.createDiv({ cls: 'practice-revealed-content practice-rendered-content' });
				void this.renderContent(hints[i] ?? '', content);
				feedback.empty();
			});
		}
	}

	private async revealAnswer(q: Question, feedback: HTMLElement): Promise<void> {
		this.engine.markAnswerRevealed();
		const answer = feedback.createDiv({ cls: 'practice-reveal-card' });
		answer.createEl('h3', { text: 'Model answer' });
		const model = answer.createDiv({ cls: 'practice-rendered-content' });
		await this.renderContent(q.answer.model, model);
		if (q.answer.explanation) {
			answer.createEl('h4', { text: 'Explanation' });
			const explanation = answer.createDiv({ cls: 'practice-rendered-content' });
			await this.renderContent(q.answer.explanation, explanation);
		}
		if (q.answer.working) {
			answer.createEl('h4', { text: 'Working' });
			const working = answer.createDiv({ cls: 'practice-rendered-content' });
			await this.renderContent(q.answer.working, working);
		}
	}

	private async renderContent(markdown: string, container: HTMLElement): Promise<void> {
		try {
			const component = await renderMarkdownContent(markdown, container, this.app.vault.getName());
			this.markdownComponents.push(component);
		} catch {
			container.empty();
			container.createEl('pre', { text: markdown });
			container.addClass('practice-render-error');
		}
	}

	private async submitResponse(response: unknown, confidence: number, feedback: HTMLElement): Promise<void> {
		const event = await this.engine.answer(response, confidence);
		if (!event) return;
		this.renderResultFeedback(feedback, event.result, event.score);
	}

	private async submitOpenResponse(result: 'correct' | 'partial' | 'incorrect', feedback: HTMLElement): Promise<void> {
		const textarea = this.contentEl.querySelector('textarea');
		const event = await this.engine.answer(textarea instanceof HTMLTextAreaElement ? textarea.value : '', 3, result);
		if (!event) return;
		this.renderResultFeedback(feedback, event.result, event.score);
	}

	private renderResultFeedback(feedback: HTMLElement, result: string, score?: number): void {
		feedback.empty();
		feedback.addClass(`practice-result-${result}`);
		const card = feedback.createDiv({ cls: 'practice-result-card' });
		card.createEl('strong', { text: result === 'correct' ? 'Correct' : result === 'partial' ? 'Partially correct' : 'Incorrect' });
		if (typeof score === 'number') card.createSpan({ text: `Score: ${Math.round(score * 100)}%` });
		const next = card.createEl('button', { text: 'Next question', cls: 'practice-primary-button' });
		next.addEventListener('click', () => void this.advance());
	}

	private async advance(): Promise<void> {
		await this.engine.nextQuestion();
		await this.renderQuestion();
	}

	private renderSummary(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('practice-engine-view', 'practice-summary-view');
		root.createEl('h2', { text: 'Practice complete' });
		root.createEl('p', { cls: 'practice-muted', text: 'Your attempt evidence has been saved locally.' });
		const actions = root.createDiv({ cls: 'practice-summary-actions' });
		const again = actions.createEl('button', { text: 'Start another session', cls: 'practice-primary-button' });
		again.addEventListener('click', () => this.renderSetup());
		const progress = actions.createEl('button', { text: 'View progress' });
		progress.addEventListener('click', () => void this.plugin.activateProgressView());
	}

	private cleanupMarkdown(): void {
		for (const component of this.markdownComponents) component.unload();
		this.markdownComponents = [];
	}
}
