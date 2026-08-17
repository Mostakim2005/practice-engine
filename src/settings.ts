import { App, PluginSettingTab } from 'obsidian';
import type PracticePlugin from './main';

export interface PracticePluginSettings {
	questionBankPath: string;
}

export const DEFAULT_SETTINGS: PracticePluginSettings = {
	questionBankPath: '_Practice/Question Banks/question-bank.json',
};

export class PracticeSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: PracticePlugin) {
		super(app, plugin);
	}

	getSettingDefinitions() {
		return [
			{
				name: 'Question bank path',
				desc: 'Location of the canonical question-bank JSON file.',
				control: {
					type: 'text' as const,
					key: 'questionBankPath' as const,
				},
			},
		];
	}

	display(): void {
		this.containerEl.empty();
		this.containerEl.createDiv({
			text: `Question bank path: ${this.plugin.settings.questionBankPath}`,
		});
	}
}