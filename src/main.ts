import { Plugin, Notice, TFile, ItemView, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS } from "./settings";
import type { PracticeSettings } from "./types";
// Fresh Nihon 2.1.0-derived entry (4021-line bundle). Full split
// (PracticeView, FSRS/SM-2, card parser, AI extractor, modals) is incremental — see README.
export default class PracticeEnginePlugin extends Plugin {
  settings!: PracticeSettings;

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!this.settings.visibleColumns) this.settings.visibleColumns = Object.assign({}, DEFAULT_SETTINGS.visibleColumns);
    this.applyThemePreferences();
    console.warn("[practice-engine] PracticeView/Scheduler split pending — entry lifecycle only in pilot.");

    this.addRibbonIcon("brain", "Practice Engine", () => new Notice("Practice Engine — pilot build."));
    this.addRibbonIcon("plus", "Add Practice Questions", () => new Notice("Add question — full port pending."));
    this.addCommand({ id: "open-practice", name: "Open Practice Engine", callback: () => new Notice("Practice Engine — pilot build.") });
    this.addCommand({ id: "add-card", name: "Add Practice Question", callback: () => new Notice("Add question — full port pending.") });
    this.addCommand({ id: "import-sr-cards", name: "Import from Spaced Repetition Plugin", callback: () => new Notice("Import — full port pending.") });
    this.addCommand({ id: "copy-prompt", name: "Copy AI Card Writing Prompt", callback: () => new Notice("Copy prompt — full port pending.") });

    this.addSettingTab(new PracticeSettingPlaceholder(this.app, this));
  }

  onunload() {
    document.body.removeClass("pe-glassmorphic");
    this.app.workspace.detachLeavesOfType("practice-engine-view");
  }

  applyThemePreferences() {
    document.body.toggleClass("pe-glassmorphic", this.settings.glassmorphism !== false);
  }

  async saveSettings() { await this.saveData(this.settings); }

  folder() { return (this.settings.practiceFolder || "").replace(/^\/+|\/+$/g, ""); }
}

import { PluginSettingTab, App } from "obsidian";
class PracticeSettingPlaceholder extends PluginSettingTab {
  constructor(app: App, private plugin: PracticeEnginePlugin) { super(app, plugin); }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Practice Engine — pilot" });
    containerEl.createEl("p", { text: "Full settings UI port is next split step. Defaults match Nihon 2.1.0." });
  }
}
