import { App, Modal, Notice, Setting } from 'obsidian';

export class ConfirmDeleteModal extends Modal {
	constructor(
		app: App,
		private readonly questionId: string,
		private readonly confirmDelete: () => Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const content = this.contentEl;
		content.empty();
		content.createEl('h2', { text: 'Delete question?' });
		content.createEl('p', { text: `This will permanently delete ${this.questionId}.` });

		new Setting(content)
			.addButton(button => button
				.setButtonText('Delete')
				.setWarning()
				.onClick(() => void this.run()))
			.addButton(button => button
				.setButtonText('Cancel')
				.onClick(() => this.close()));
	}

	private async run(): Promise<void> {
		try {
			await this.confirmDelete();
			new Notice('Question deleted.');
			this.close();
		} catch (error) {
			new Notice(`Delete failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
