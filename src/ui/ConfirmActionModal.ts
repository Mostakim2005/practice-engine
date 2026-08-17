import { App, Modal, Setting } from 'obsidian';

export class ConfirmActionModal extends Modal {
	constructor(
		app: App,
		private readonly titleText: string,
		private readonly message: string,
		private readonly actionText: string,
		private readonly onConfirm: () => Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const e = this.contentEl;
		e.empty();
		e.createEl('h2', { text: this.titleText });
		e.createEl('p', { text: this.message });
		new Setting(e)
			.addButton((b) =>
				b
					.setButtonText(this.actionText)
					.setWarning()
					.onClick(() => void this.run()),
			)
			.addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()));
	}

	private async run(): Promise<void> {
		try {
			await this.onConfirm();
			this.close();
		} catch (error) {
			this.contentEl.createEl('p', {
				text: `Action failed: ${error instanceof Error ? error.message : String(error)}`,
				cls: 'mod-warning',
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}