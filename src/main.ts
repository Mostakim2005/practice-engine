import { Notice, Plugin } from 'obsidian';
import { QuestionRepository } from './data/QuestionRepository';
import { AttemptRepository } from './data/AttemptRepository';
import { PracticeView, PRACTICE_VIEW_TYPE } from './ui/PracticeView';
import { ProgressView, PROGRESS_VIEW_TYPE } from './ui/ProgressView';
import { exportQuestionBank } from './exporters/JsonExporter';
import { ImportPreviewModal } from './ui/ImportPreviewModal';
import { QuestionBankView, QUESTION_BANK_VIEW_TYPE } from './ui/QuestionBankView';
import { DEFAULT_SETTINGS, PracticePluginSettings, PracticeSettingTab } from './settings';
import { validateQuestionBank } from './validation/QuestionValidator';

export default class PracticePlugin extends Plugin {
	settings!: PracticePluginSettings;
	readonly repository = new QuestionRepository(this.app);
	readonly attempts = new AttemptRepository(this.app);

	async onload(): Promise<void> {
		await this.loadSettings();
		try {
			await this.repository.load();
		} catch (error) {
			new Notice(`Question bank load failed: ${error instanceof Error ? error.message : String(error)}`);
		}

		this.registerView(QUESTION_BANK_VIEW_TYPE, (leaf) => new QuestionBankView(leaf, this));
		this.registerView(PRACTICE_VIEW_TYPE, (leaf) => new PracticeView(leaf, this));
		this.registerView(PROGRESS_VIEW_TYPE, (leaf) => new ProgressView(leaf, this));

		this.addRibbonIcon('library', 'Open question bank', () => void this.activateQuestionBankView());
		this.addRibbonIcon('graduation-cap', 'Start practice', () => void this.activatePracticeView());
		this.addRibbonIcon('bar-chart-3', 'Open practice progress', () => void this.activateProgressView());

		this.addCommand({
			id: 'start-practice',
			name: 'Start practice',
			callback: () => void this.activatePracticeView(),
		});
		this.addCommand({
			id: 'open-practice-progress',
			name: 'Open practice progress',
			callback: () => void this.activateProgressView(),
		});
		this.addCommand({
			id: 'open-question-bank',
			name: 'Open question bank',
			callback: () => void this.activateQuestionBankView(),
		});
		this.addCommand({
			id: 'import-question-bank-json',
			name: 'Import question bank JSON',
			callback: () => void this.chooseAndPreviewImport(),
		});
		this.addCommand({
			id: 'export-question-bank-json',
			name: 'Export question bank JSON',
			callback: () => this.exportJson(),
		});
		this.addCommand({
			id: 'create-question',
			name: 'Create question',
			callback: () => void this.activateQuestionBankView('create'),
		});

		this.addSettingTab(new PracticeSettingTab(this.app, this));
	}

	async activatePracticeView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(PRACTICE_VIEW_TYPE)[0];
		const leaf = existing ?? this.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: PRACTICE_VIEW_TYPE, active: true });
	}

	async activateProgressView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(PROGRESS_VIEW_TYPE)[0];
		const leaf = existing ?? this.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: PROGRESS_VIEW_TYPE, active: true });
	}

	async activateQuestionBankView(action?: 'create'): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(QUESTION_BANK_VIEW_TYPE)[0];
		const leaf = existing ?? this.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: QUESTION_BANK_VIEW_TYPE, active: true });
		if (action === 'create') {
			const view = leaf.view;
			if (view instanceof QuestionBankView) view.openCreateModal();
		}
	}

	async chooseAndPreviewImport(): Promise<void> {
		const input = document.body.createEl('input', { type: 'file' });
		input.accept = '.json,application/json';
		input.addClass('is-hidden');
		document.body.appendChild(input);
		input.addEventListener(
			'change',
			() => {
				const file = input.files?.[0];
				if (file) void this.previewImport(file);
				input.remove();
			},
			{ once: true },
		);
		input.click();
	}

	private async previewImport(file: File): Promise<void> {
		try {
			const raw = JSON.parse(await file.text()) as unknown;
			const preview = this.repository.prepareImport(raw);
			new ImportPreviewModal(this.app, preview, async (replace) => {
				await this.repository.commitImport(preview, replace);
				this.refreshViews();
			}).open();
		} catch (error) {
			new Notice(`Could not parse JSON: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	exportJson(): void {
		const bank = this.repository.getBank();
		const v = validateQuestionBank(bank);
		if (v.issues.some((x) => x.severity === 'error')) {
			new Notice('Export blocked: stored question bank is invalid.');
			return;
		}
		exportQuestionBank(bank);
		new Notice(`Exported ${bank.questions.length} question(s).`);
	}

	refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(QUESTION_BANK_VIEW_TYPE)) {
			if (leaf.view instanceof QuestionBankView) leaf.view.render();
		}
		for (const leaf of this.app.workspace.getLeavesOfType(PROGRESS_VIEW_TYPE)) {
			if (leaf.view instanceof ProgressView) void leaf.view.render();
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<PracticePluginSettings>,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
