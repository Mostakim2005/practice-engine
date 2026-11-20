import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from "obsidian";
import { DEFAULT_SETTINGS } from "./settings";
import type { AnkiSyncMode, PracticeSettings } from "./types";
import { DerivedCardIndex } from "./core/card-index";
import { AnkiBridge } from "./sync/anki-bridge";
import { isLeechCard, scheduleWithTsFsrs } from "./core/fsrs-adapter";

export default class PracticeEnginePlugin extends Plugin {
  settings!: PracticeSettings;
  index!: DerivedCardIndex;
  anki!: AnkiBridge;

  async onload(): Promise<void> {
    const loaded = (await this.loadData()) as Record<string, unknown> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
    if (!this.settings.visibleColumns) {
      this.settings.visibleColumns = Object.assign({}, DEFAULT_SETTINGS.visibleColumns);
    }
    this.applyThemePreferences();

    this.index = new DerivedCardIndex(this.app, () => this.settings);
    this.anki = new AnkiBridge(() => this.settings);

    this.app.workspace.onLayoutReady(() => {
      void this.index.rebuildAll();
    });

    this.registerEvent(
      this.app.vault.on("modify", (f) => {
        if (f instanceof TFile && f.extension === "md") void this.index.reindexFile(f);
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (f) => this.index.removeFile(f.path))
    );
    this.registerEvent(
      this.app.vault.on("rename", (f, oldPath) => {
        this.index.removeFile(oldPath);
        if (f instanceof TFile && f.extension === "md") void this.index.reindexFile(f);
      })
    );

    this.addCommand({
      id: "sync-practice-cards-anki",
      name: "Sync Practice Engine cards via active Anki backend",
      callback: async () => this.runAnkiSync(),
    });

    this.addCommand({
      id: "export-fsrs4anki-log",
      name: "Copy FSRS4Anki review log JSON to clipboard",
      callback: async () => {
        const json = this.anki.exportFsrs4AnkiReviewLog(this.index.getAllCards());
        await navigator.clipboard.writeText(json);
        new Notice("Copied FSRS4Anki review log JSON to clipboard.");
      },
    });

    this.addSettingTab(new PracticeEngineSettingTab(this.app, this));
  }

  onunload(): void {
    document.body.removeClass("pe-glassmorphic");
  }

  applyThemePreferences(): void {
    document.body.toggleClass("pe-glassmorphic", this.settings.glassmorphism !== false);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async runAnkiSync(): Promise<void> {
    const mode = this.settings.ankiSyncMode;
    const cards = this.index.getAllCards();
    if (mode === "none") {
      new Notice("Anki sync mode is set to Obsidian-only (none). Change it in Practice Engine settings.");
      return;
    }
    if (mode === "anki-connect") {
      let synced = 0;
      for (const card of cards) {
        try {
          await this.anki.pushCardToAnkiConnect(card);
          synced++;
        } catch (err) {
          console.error("[Practice Engine] AnkiConnect push failed:", err);
        }
      }
      new Notice(`Synced ${synced}/${cards.length} card(s) to AnkiConnect.`);
      return;
    }
    if (mode === "obsidian-to-anki") {
      const blocks = cards.map((c) => this.anki.formatObsidianToAnkiBlock(c)).join("\n\n");
      await navigator.clipboard.writeText(blocks);
      new Notice(`Copied ${cards.length} Obsidian_to_Anki formatted block(s) to clipboard.`);
      return;
    }
    const logJson = this.anki.exportFsrs4AnkiReviewLog(cards);
    await navigator.clipboard.writeText(logJson);
    new Notice(`Copied FSRS4Anki review log for ${cards.length} card(s) to clipboard.`);
  }

  scheduleCard = scheduleWithTsFsrs;
  isLeechCard = isLeechCard;
}

class PracticeEngineSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: PracticeEnginePlugin) {
    super(app, plugin);
  }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("Practice Engine v3 Settings").setHeading();

    new Setting(containerEl)
      .setName("Anki Sync Backend")
      .setDesc("Switch between Obsidian-only ts-fsrs, AnkiConnect, Obsidian_to_Anki export, or FSRS4Anki log export.")
      .addDropdown((d) =>
        d
          .addOption("none", "Obsidian Only (ts-fsrs)")
          .addOption("anki-connect", "AnkiConnect (Local HTTP :8765)")
          .addOption("obsidian-to-anki", "Obsidian_to_Anki Block Format")
          .addOption("fsrs4anki-export", "FSRS4Anki Optimizer Export")
          .setValue(this.plugin.settings.ankiSyncMode)
          .onChange(async (val) => {
            this.plugin.settings.ankiSyncMode = val as AnkiSyncMode;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("AnkiConnect URL")
      .setDesc("Local AnkiConnect endpoint when Anki Desktop is running.")
      .addText((t) =>
        t.setValue(this.plugin.settings.ankiConnectUrl).onChange(async (val) => {
          this.plugin.settings.ankiConnectUrl = val || "http://127.0.0.1:8765";
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Obsidian Spaced Repetition Compatibility")
      .setDesc("Emit <!--SR:!due,ivl,ease--> tags alongside <!--pe-meta:...--> comments.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.enableObsidianSRCompat).onChange(async (val) => {
          this.plugin.settings.enableObsidianSRCompat = val;
          await this.plugin.saveSettings();
        })
      );
  }
}
