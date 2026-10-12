import { Plugin, WorkspaceLeaf } from 'obsidian';
import { PracticeView, PRACTICE_VIEW_TYPE } from './PracticeView';
import { DEFAULT_SETTINGS, PracticeSettings, PracticeSettingTab } from './settings';

export default class PracticeEnginePlugin extends Plugin {
    settings: PracticeSettings = DEFAULT_SETTINGS;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.registerView(
            PRACTICE_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => new PracticeView(leaf, () => this.settings.practiceFolder)
        );

        this.addRibbonIcon('brain', 'Open Practice Session', () => {
            this.activateView();
        });

        this.addCommand({
            id: 'open-practice-session',
            name: 'Start Practice Session',
            callback: () => this.activateView()
        });

        this.addSettingTab(new PracticeSettingTab(this.app, this));
    }

    async activateView(): Promise<void> {
        const leaves = this.app.workspace.getLeavesOfType(PRACTICE_VIEW_TYPE);
        if (leaves.length > 0) {
            this.app.workspace.revealLeaf(leaves[0]);
            return;
        }

        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({ type: PRACTICE_VIEW_TYPE, active: true });
            this.app.workspace.revealLeaf(leaf);
        }
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}