import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from "obsidian";
import { DEFAULT_SETTINGS } from "./settings";
import type {
  AnkiSyncMode,
  AnkiSyncResult,
  CardFormat,
  IndexedCard,
  PracticeSettings,
} from "./types";
import { DerivedCardIndex } from "./core/card-index";
import { isLeechCard, scheduleWithTsFsrs } from "./core/fsrs-adapter";
import { AI_CARD_PROMPT, VaultCardStore } from "./core/vault-store";
import { AnkiBridge } from "./sync/anki-bridge";
import { QuestionEditorModal } from "./ui/modals";
import { PracticeView, VIEW_TYPE_PRACTICE_ENGINE } from "./ui/practice-view";

export default class PracticeEnginePlugin extends Plugin {
  settings!: PracticeSettings;
  index!: DerivedCardIndex;
  store!: VaultCardStore;
  anki!: AnkiBridge;
  private isSyncing = false;

  async onload(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<PracticeSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
    this.settings.visibleColumns = Object.assign(
      {},
      DEFAULT_SETTINGS.visibleColumns,
      loaded?.visibleColumns ?? {}
    );
    this.applyThemePreferences();

    this.index = new DerivedCardIndex(this.app, () => this.settings);
    this.store = new VaultCardStore(this.app, () => this.settings);
    this.anki = new AnkiBridge(() => this.settings);

    this.registerView(
      VIEW_TYPE_PRACTICE_ENGINE,
      (leaf) => new PracticeView(leaf, this)
    );

    // Ribbon menu buttons for instant access
    this.addRibbonIcon("brain", "Open Practice Engine Workstation", () => {
      void this.activateView();
    });
    this.addRibbonIcon("plus", "Add Practice Question", () => {
      new QuestionEditorModal(this.app, this).open();
    });

    this.app.workspace.onLayoutReady(() => {
      void this.index.rebuildAll();
    });

    this.registerEvent(
      this.app.vault.on("create", (f) => {
        if (f instanceof TFile && f.extension === "md") this.index.scheduleReindex(f);
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", (f) => {
        if (f instanceof TFile && f.extension === "md") this.index.scheduleReindex(f);
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (f) => this.index.removeFile(f.path))
    );
    this.registerEvent(
      this.app.vault.on("rename", (f, oldPath) => {
        this.index.removeFile(oldPath);
        if (f instanceof TFile && f.extension === "md") this.index.scheduleReindex(f);
      })
    );

    this.addCommand({
      id: "open-practice-workstation",
      name: "Open Practice Engine Workstation",
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: "add-practice-question",
      name: "Add Practice Question",
      callback: () => new QuestionEditorModal(this.app, this).open(),
    });

    this.addCommand({
      id: "sync-practice-cards-anki",
      name: "Sync Practice Engine cards via active Anki backend",
      callback: () => void this.runAnkiSync(),
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

    this.addCommand({
      id: "import-sr-cards",
      name: "Import from Obsidian Spaced Repetition (<!--SR:...-->)",
      callback: async () => {
        await this.store.importSpacedRepetitionCards(this.index.getPracticeFiles());
        await this.index.rebuildAll();
      },
    });

    this.addCommand({
      id: "copy-ai-card-prompt",
      name: "Copy AI Card Writing Prompt",
      callback: async () => {
        await navigator.clipboard.writeText(AI_CARD_PROMPT);
        new Notice("Copied AI flashcard writing prompt to clipboard.");
      },
    });

    this.addCommand({
      id: "rebuild-card-index",
      name: "Rebuild Practice Engine Card Index",
      callback: async () => {
        await this.index.rebuildAll();
        new Notice(`Indexed ${this.index.getAllCards().length} practice card(s).`);
      },
    });

    this.addSettingTab(new PracticeEngineSettingTab(this.app, this));
  }

  onunload(): void {
    this.index?.dispose();
    document.body.removeClass("pe-glassmorphic");
  }

  applyThemePreferences(): void {
    document.body.toggleClass("pe-glassmorphic", this.settings.glassmorphism !== false);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async activateView(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_PRACTICE_ENGINE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_PRACTICE_ENGINE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  async runAnkiSync(subset?: IndexedCard[]): Promise<AnkiSyncResult> {
    const cards = subset ?? this.index.getAllCards();
    const mode = this.settings.ankiSyncMode;
    const result: AnkiSyncResult = { synced: 0, failed: 0, total: cards.length, errors: [] };

    if (this.isSyncing) {
      new Notice("Anki sync is already in progress.");
      return result;
    }

    if (mode === "none") {
      new Notice(
        "Anki sync mode is set to Obsidian-only (none). Change it in Practice Engine settings."
      );
      return result;
    }

    this.isSyncing = true;
    try {
      if (mode === "anki-connect") {
        this.anki.resetSessionCache();
        for (const card of cards) {
          try {
            const noteId = await this.anki.pushCardToAnkiConnect(card);
            if (noteId && card.meta.ankiNoteId !== noteId) {
              await this.store.writeCardMetadata(card, { ...card.meta, ankiNoteId: noteId });
            }
            result.synced++;
          } catch (err) {
            result.failed++;
            const msg = err instanceof Error ? err.message : String(err);
            result.errors.push(`${card.meta.id}: ${msg}`);
            console.error("[Practice Engine] AnkiConnect push failed:", err);
          }
        }
        new Notice(
          `Synced ${result.synced}/${result.total} card(s) to AnkiConnect${result.failed ? ` (${result.failed} failed)` : ""}.`
        );
        return result;
      }

      if (mode === "obsidian-to-anki") {
        const blocks = cards.map((c) => this.anki.formatObsidianToAnkiBlock(c)).join("\n\n");
        await navigator.clipboard.writeText(blocks);
        result.synced = cards.length;
        new Notice(`Copied ${cards.length} Obsidian_to_Anki formatted block(s) to clipboard.`);
        return result;
      }

      const logJson = this.anki.exportFsrs4AnkiReviewLog(cards);
      await navigator.clipboard.writeText(logJson);
      result.synced = cards.length;
      new Notice(`Copied FSRS4Anki review log for ${cards.length} card(s) to clipboard.`);
      return result;
    } finally {
      this.isSyncing = false;
    }
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

    new Setting(containerEl).setName("Spaced repetition & vault").setHeading();

    new Setting(containerEl)
      .setName("Practice Notes Folder")
      .setDesc("Vault folder scanned for practice cards (leave blank to scan entire vault).")
      .addText((t) =>
        t
          .setPlaceholder("Practice")
          .setValue(this.plugin.settings.practiceFolder)
          .onChange(async (val) => {
            this.plugin.settings.practiceFolder = val.trim();
            await this.plugin.saveSettings();
            await this.plugin.index.rebuildAll();
          })
      );

    new Setting(containerEl)
      .setName("FSRS Target Retention Rate")
      .setDesc("Desired recall probability at due date (default 90%).")
      .addSlider((s) =>
        s
          .setLimits(75, 97, 1)
          .setValue(Math.round((this.plugin.settings.targetRetention || 0.9) * 100))
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.plugin.settings.targetRetention = val / 100;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Card Markdown Format")
      .setDesc("Format used when saving new questions.")
      .addDropdown((d) =>
        d
          .addOption("callout", "Callout (> [!question] & > > [!answer])")
          .addOption("block", "Clean Markdown Block (%%pe-card%% ... %%pe-end%%)")
          .setValue(this.plugin.settings.cardFormat)
          .onChange(async (val) => {
            this.plugin.settings.cardFormat = val as CardFormat;
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

    new Setting(containerEl).setName("Anki synchronization").setHeading();

    new Setting(containerEl)
      .setName("Anki Sync Backend")
      .setDesc(
        "Switch between Obsidian-only ts-fsrs, AnkiConnect, Obsidian_to_Anki export, or FSRS4Anki log export."
      )
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
          this.plugin.settings.ankiConnectUrl = val.trim() || "http://127.0.0.1:8765";
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Default Anki Deck")
      .setDesc("Target deck name used when pushing cards via AnkiConnect or Obsidian_to_Anki.")
      .addText((t) =>
        t.setValue(this.plugin.settings.ankiDefaultDeck).onChange(async (val) => {
          this.plugin.settings.ankiDefaultDeck = val.trim() || "Practice Engine";
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Anki Note Type")
      .setDesc("Note model auto-created in Anki (requires Front, Back, PE_Meta fields).")
      .addText((t) =>
        t.setValue(this.plugin.settings.ankiNoteType).onChange(async (val) => {
          this.plugin.settings.ankiNoteType = val.trim() || "PracticeEngine-2Stage";
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName("Appearance").setHeading();

    new Setting(containerEl)
      .setName("Frosted Glassmorphism")
      .setDesc("Apply translucent surfaces and backdrop blur to Practice Engine cards and modals.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.glassmorphism !== false).onChange(async (val) => {
          this.plugin.settings.glassmorphism = val;
          await this.plugin.saveSettings();
          this.plugin.applyThemePreferences();
        })
      );
  }
}
