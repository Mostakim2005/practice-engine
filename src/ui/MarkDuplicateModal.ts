import { App, Modal, Notice, Setting } from 'obsidian';
import { Question } from '../types/question';

export class MarkDuplicateModal extends Modal {
	constructor(
		app: App,
		private readonly duplicateQuestion: Question,
		private readonly candidates: Question[],
		private readonly onConfirm: (duplicateOf: string) => Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const e = this.contentEl;
		e.empty();
		e.createEl('h2', { text: 'Mark question as duplicate' });
		e.createEl('p', {
			text: `${this.duplicateQuestion.id} will be linked to an existing question as its duplicate.`,
		});

		new Setting(e).setName('Original question').addDropdown((d) => {
			for (const candidate of this.candidates) {
				d.addOption(candidate.id, `${candidate.id} — ${candidate.question}`);
			}
			if (this.candidates[0]) d.setValue(this.candidates[0].id);
			this.selectedId = this.candidates[0]?.id ?? '';
			d.onChange((value) => (this.selectedId = value));
		});

		new Setting(e)
			.addButton((b) => b.setButtonText('Mark duplicate').setWarning().onClick(() => void this.save()))
			.addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()));
	}

	private selectedId = '';

	private async save(): Promise<void> {
		if (!this.selectedId) {
			new Notice('Choose the original question first.');
			return;
		}
		try {
			await this.onConfirm(this.selectedId);
			new Notice(`${this.duplicateQuestion.id} marked as a duplicate.`);
			this.close();
		} catch (error) {
			new Notice(`Could not mark duplicate: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
