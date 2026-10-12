import { App, PluginSettingTab, Setting } from 'obsidian';
import PracticeEnginePlugin from './main';

export interface PracticeSettings {
    practiceFolder: string;
}

export const DEFAULT_SETTINGS: PracticeSettings = {
    practiceFolder: 'Practice'
};

export class PracticeSettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: PracticeEnginePlugin) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Practice Engine Settings' });

        new Setting(containerEl)
            .setName('Practice Notes Folder')
            .setDesc('Folder where your topic practice Markdown notes are kept.')
            .addText(text => text
                .setPlaceholder('Practice')
                .setValue(this.plugin.settings.practiceFolder)
                .onChange(async (val) => {
                    this.plugin.settings.practiceFolder = val.trim() || 'Practice';
                    await this.plugin.saveSettings();
                }));
    }
}