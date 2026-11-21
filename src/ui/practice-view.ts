import {
  Component,
  ItemView,
  MarkdownRenderer,
  Notice,
  TFile,
  setIcon,
  type WorkspaceLeaf,
} from "obsidian";
import type PracticeEnginePlugin from "../main";
import {
  ACCURACY_DIAGNOSTICS,
  RETRIEVAL_EFFORTS,
  type IndexedCard,
} from "../types";
import {
  addLocalDays,
  isLeechCard,
  scheduleWithTsFsrs,
  todayLocalStr,
} from "../core/fsrs-adapter";
import {
  attachInteractiveTapeAndClozeListeners,
  processClozeAndTapeMarkdown,
} from "../core/markdown-ast";
import { AI_CARD_PROMPT } from "../core/vault-store";
import { DeleteConfirmModal, QuestionEditorModal } from "./modals";

export const VIEW_TYPE_PRACTICE_ENGINE = "practice-engine-view";

type ActiveTab = "study" | "browser" | "analytics" | "sync";
type FilterMode = "DUE" | "STRUGGLING" | "LEECH" | "ALL";

export class PracticeView extends ItemView {
  private currentTab: ActiveTab = "study";
  private sessionActive = false;
  private queue: IndexedCard[] = [];
  private allCards: IndexedCard[] = [];
  private pos = 0;
  private stage: "question" | "answer" = "question";
  private effort: string | null = null;
  private checkedConcepts = new Set<string>();
  private selectedKeys = new Set<string>();
  private lastClickedRowIdx = -1;

  private filterSubject = "ALL";
  private filterTopic = "ALL";
  private filterTag = "ALL";
  private filterMode: FilterMode = "DUE";
  private searchQuery = "";
  private heatmapRange: "30" | "90" | "180" | "365" = "365";
  private ankiStatusText = "Not checked yet";
  private ankiStatusOk: boolean | null = null;

  private unsubscribeIndex: (() => void) | null = null;
  private cardRenderComponent: Component | null = null;
  private activePopover: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: PracticeEnginePlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_PRACTICE_ENGINE;
  }

  getDisplayText(): string {
    return "Practice Engine";
  }

  getIcon(): string {
    return "brain";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("pe-root");
    this.contentEl.tabIndex = 0;

    this.registerDomEvent(this.contentEl, "keydown", (e: KeyboardEvent) => this.onKey(e));
    this.registerDomEvent(window, "click", () => {
      if (this.activePopover && !this.activePopover.hasClass("pe-hidden")) {
        this.activePopover.addClass("pe-hidden");
      }
    });

    this.unsubscribeIndex = this.plugin.index.onChange(() => {
      if (!this.sessionActive) {
        this.refreshFromIndex();
      }
    });

    this.refreshFromIndex();
  }

  async onClose(): Promise<void> {
    if (this.unsubscribeIndex) {
      this.unsubscribeIndex();
      this.unsubscribeIndex = null;
    }
    if (this.cardRenderComponent) {
      this.cardRenderComponent.unload();
      this.cardRenderComponent = null;
    }
    this.activePopover = null;
  }

  refreshFromIndex(): void {
    this.allCards = this.plugin.index.getAllCards();
    const validKeys = new Set(this.allCards.map((c) => c.key));
    for (const k of Array.from(this.selectedKeys)) {
      if (!validKeys.has(k)) this.selectedKeys.delete(k);
    }
    this.buildQueue();
    this.render();
  }

  private buildQueue(): void {
    const today = todayLocalStr();
    let list = this.allCards.slice();

    if (this.filterSubject !== "ALL") {
      list = list.filter((c) => c.subjects.includes(this.filterSubject));
    }
    if (this.filterTag !== "ALL") {
      list = list.filter((c) => c.tags.includes(this.filterTag));
    }
    if (this.filterTopic !== "ALL") {
      list = list.filter((c) => c.filePath === this.filterTopic);
    }

    if (this.filterMode === "DUE") {
      list = list.filter((c) => c.meta.due <= today);
    } else if (this.filterMode === "STRUGGLING") {
      list = list.filter(
        (c) => (c.meta.d && c.meta.d >= 6.5) || c.meta.diff >= 3.3 || c.meta.lapses > 0
      );
    } else if (this.filterMode === "LEECH") {
      list = list.filter((c) => isLeechCard(c.meta));
    }

    list.sort((a, b) => a.meta.due.localeCompare(b.meta.due));
    this.queue = list;
    this.pos = 0;
    this.stage = "question";
    this.effort = null;
    this.checkedConcepts.clear();
  }

  render(): void {
    const root = this.contentEl;
    root.empty();
    this.activePopover = null;

    if (this.cardRenderComponent) {
      this.cardRenderComponent.unload();
      this.cardRenderComponent = null;
    }

    const top = root.createDiv({ cls: "pe-view-header" });
    const brand = top.createDiv({ cls: "pe-brand-title" });
    setIcon(brand.createSpan(), "brain");
    brand.createSpan({ text: "Practice Engine" });

    const seg = top.createDiv({ cls: "pe-seg" });
    const tabs: Array<[ActiveTab, string]> = [
      ["study", "Study Queue"],
      ["browser", "Card Browser"],
      ["analytics", "Analytics"],
      ["sync", "Sync & Tools"],
    ];
    for (const [tabId, label] of tabs) {
      const btn = seg.createEl("button", {
        cls: `pe-seg-btn ${this.currentTab === tabId ? "is-active" : ""}`,
        text: label,
      });
      btn.onclick = () => {
        this.currentTab = tabId;
        this.sessionActive = false;
        this.render();
      };
    }

    const topActions = top.createDiv({ cls: "pe-top-actions" });
    const addBtn = topActions.createEl("button", {
      cls: "pe-btn-primary",
      text: "+ Add Question",
    });
    addBtn.onclick = () => new QuestionEditorModal(this.app, this.plugin).open();

    if (this.currentTab === "study") {
      if (this.sessionActive) void this.renderActiveTesting(root);
      else this.renderStudyDashboard(root);
    } else if (this.currentTab === "browser") {
      this.renderCardBrowser(root);
    } else if (this.currentTab === "analytics") {
      this.renderAnalyticsReport(root);
    } else {
      this.renderSyncAndTools(root);
    }
  }

  private renderStudyDashboard(root: HTMLElement): void {
    const bar = root.createDiv({ cls: "pe-filter-bar" });

    const subjects = ["ALL", ...this.plugin.index.getAllSubjects()];
    const sSel = bar.createEl("select", { cls: "pe-select-pill" });
    for (const s of subjects) {
      sSel.createEl("option", { text: s === "ALL" ? "All Subjects" : s, attr: { value: s } });
    }
    sSel.value = this.filterSubject;
    sSel.onchange = () => {
      this.filterSubject = sSel.value;
      this.buildQueue();
      this.render();
    };

    const tags = ["ALL", ...this.plugin.index.getAllTags()];
    if (tags.length > 1) {
      const tagSel = bar.createEl("select", { cls: "pe-select-pill" });
      for (const t of tags) {
        tagSel.createEl("option", { text: t === "ALL" ? "All Tags" : `#${t}`, attr: { value: t } });
      }
      tagSel.value = this.filterTag;
      tagSel.onchange = () => {
        this.filterTag = tagSel.value;
        this.buildQueue();
        this.render();
      };
    }

    const cardCountsByPath = new Map<string, number>();
    for (const c of this.allCards) {
      cardCountsByPath.set(c.filePath, (cardCountsByPath.get(c.filePath) ?? 0) + 1);
    }
    const files = this.plugin.index.getPracticeFiles();
    const tSel = bar.createEl("select", { cls: "pe-select-pill" });
    tSel.createEl("option", { text: "All Topic Notes", attr: { value: "ALL" } });
    for (const f of files) {
      const cnt = cardCountsByPath.get(f.path) ?? 0;
      tSel.createEl("option", {
        text: cnt > 0 ? `${f.basename} (${cnt})` : `${f.basename} (0 cards)`,
        attr: { value: f.path },
      });
    }
    tSel.value = this.filterTopic;
    tSel.onchange = () => {
      this.filterTopic = tSel.value;
      this.buildQueue();
      this.render();
    };

    const mSel = bar.createEl("select", { cls: "pe-select-pill" });
    mSel.createEl("option", { text: "Due Questions Only", attr: { value: "DUE" } });
    mSel.createEl("option", { text: "Struggling Cards", attr: { value: "STRUGGLING" } });
    mSel.createEl("option", { text: "Leech Cards", attr: { value: "LEECH" } });
    mSel.createEl("option", { text: "Cram All Cards", attr: { value: "ALL" } });
    mSel.value = this.filterMode;
    mSel.onchange = () => {
      this.filterMode = mSel.value as FilterMode;
      this.buildQueue();
      this.render();
    };

    const today = todayLocalStr();
    const dueCount = this.allCards.filter((c) => c.meta.due <= today).length;
    const leechCount = this.allCards.filter((c) => isLeechCard(c.meta)).length;
    const retentionPct = Math.round((this.plugin.settings.targetRetention || 0.9) * 100);

    const dash = root.createDiv({ cls: "pe-dashboard" });
    dash.createEl("h2", { text: "Active Recall Workstation" });
    dash.createEl("p", {
      cls: "pe-dashboard-subtitle",
      text: `Two-stage metacognitive review powered by official ts-fsrs (target retention: ${retentionPct}%).`,
    });

    const statRow = dash.createDiv({ cls: "pe-stats-row" });
    const addStat = (val: string, lbl: string) => {
      const card = statRow.createDiv({ cls: "pe-stat-card" });
      card.createDiv({ cls: "pe-stat-val", text: val });
      card.createDiv({ cls: "pe-stat-lbl", text: lbl });
    };
    addStat(String(dueCount), "Due Today");
    addStat(String(leechCount), "Leeches");
    addStat(String(this.queue.length), "Ready in Queue");
    addStat(String(this.allCards.length), "Total Indexed");

    const startBtn = dash.createEl("button", {
      cls: "pe-btn-primary pe-start-btn",
      text: `Start Session (${this.queue.length} cards)`,
    });
    startBtn.disabled = this.queue.length === 0;
    startBtn.onclick = () => {
      this.sessionActive = true;
      this.pos = 0;
      this.stage = "question";
      this.effort = null;
      this.checkedConcepts.clear();
      this.render();
      setTimeout(() => this.contentEl.focus(), 50);
    };

    if (this.queue.length === 0) {
      dash.createEl("p", {
        cls: "pe-done-note",
        text: 'No questions match this filter. Switch to "Cram All Cards" or click "+ Add Question" to create one.',
      });
    }
  }

  private async renderActiveTesting(root: HTMLElement): Promise<void> {
    if (!this.queue.length || this.pos >= this.queue.length) {
      const done = root.createDiv({ cls: "pe-dashboard" });
      done.createEl("h2", { text: "Session Complete" });
      done.createEl("p", {
        text: `You reviewed all ${this.queue.length} card(s) in this queue.`,
      });
      const returnBtn = done.createEl("button", {
        cls: "pe-btn-primary",
        text: "Back to Dashboard",
      });
      returnBtn.onclick = () => {
        this.sessionActive = false;
        this.refreshFromIndex();
      };
      return;
    }

    const card = this.queue[this.pos]!;
    this.cardRenderComponent = new Component();
    this.cardRenderComponent.load();

    const testHeader = root.createDiv({ cls: "pe-test-header" });
    const subjTitle = card.subjects.length ? card.subjects.join(", ") : "General";
    testHeader.createSpan({
      cls: "pe-card-title",
      text: `${card.fileBasename} · ${subjTitle}`,
    });

    const topActions = testHeader.createDiv({ cls: "pe-top-actions" });
    const tapeBtn = topActions.createEl("button", {
      cls: "pe-btn-secondary pe-btn-sm",
      text: "Toggle Tapes (T)",
    });
    tapeBtn.onclick = () => this.toggleAllMaskingTapes();

    const editBtn = topActions.createEl("button", {
      cls: "pe-btn-secondary pe-btn-sm",
      text: "Edit Card",
    });
    editBtn.onclick = () => new QuestionEditorModal(this.app, this.plugin, card).open();

    const endBtn = topActions.createEl("button", { cls: "pe-btn-secondary pe-btn-sm" });
    endBtn.createSpan({ text: "Exit" });
    endBtn.createSpan({ cls: "pe-esc-kbd", text: "Esc" });
    endBtn.onclick = () => {
      this.sessionActive = false;
      this.refreshFromIndex();
    };

    const track = root.createDiv({ cls: "pe-progress-track" });
    track.createDiv({
      cls: "pe-progress-fill",
      attr: { style: `width: ${((this.pos + 1) / this.queue.length) * 100}%` },
    });

    const cardEl = root.createDiv({ cls: "pe-card" });
    const chips = cardEl.createDiv({ cls: "pe-chips" });
    chips.createSpan({ cls: "pe-chip pe-chip-accent", text: card.type });
    chips.createSpan({ cls: "pe-chip", text: `Difficulty: ${card.difficulty}` });
    if (isLeechCard(card.meta)) {
      chips.createSpan({ cls: "pe-badge-alert", text: "Leech" });
    }
    for (const tg of card.tags) {
      chips.createSpan({ cls: "pe-chip pe-card-tag", text: `#${tg}` });
    }
    chips.createSpan({ cls: "pe-chip", text: `Stability: ${card.meta.s.toFixed(1)}d` });
    chips.createSpan({
      cls: "pe-chip",
      text: `Card ${this.pos + 1} of ${this.queue.length}`,
    });

    const qBox = cardEl.createDiv({ cls: "pe-question" });
    const qProcessed = processClozeAndTapeMarkdown(card.questionMd, this.stage === "answer");
    await MarkdownRenderer.render(
      this.app,
      qProcessed,
      qBox,
      card.filePath,
      this.cardRenderComponent
    );
    attachInteractiveTapeAndClozeListeners(qBox);

    if (this.stage === "question") {
      const s1 = cardEl.createDiv({ cls: "pe-stage-box" });
      s1.createDiv({
        cls: "pe-stage-label",
        text: "Stage 1: Predict retrieval effort before revealing (Keys 1-6 or Space)",
      });
      const grid = s1.createDiv({ cls: "pe-btn-grid" });
      RETRIEVAL_EFFORTS.forEach((e, idx) => {
        const btn = grid.createEl("button", { cls: `pe-choice-btn ${e.css}` });
        btn.createSpan({ cls: "pe-choice-key", text: String(idx + 1) });
        const wrap = btn.createDiv({ cls: "pe-choice-textwrap" });
        wrap.createSpan({ cls: "pe-choice-label", text: e.label });
        wrap.createSpan({ cls: "pe-choice-hint", text: e.hint });
        btn.onclick = () => {
          this.effort = e.id;
          this.stage = "answer";
          this.render();
        };
      });

      const btm = cardEl.createDiv({ cls: "pe-anki-controls" });
      const skipBtn = btm.createEl("button", {
        cls: "pe-btn-secondary",
        text: "Skip Card (→)",
      });
      skipBtn.onclick = () => this.advanceCard();
    } else {
      const aBox = cardEl.createDiv({ cls: "pe-answer" });
      const aProcessed = processClozeAndTapeMarkdown(card.answerMd, true);
      await MarkdownRenderer.render(
        this.app,
        aProcessed,
        aBox,
        card.filePath,
        this.cardRenderComponent
      );
      attachInteractiveTapeAndClozeListeners(aBox);

      if (card.concepts.length) {
        const checkWrap = cardEl.createDiv({ cls: "pe-checklist" });
        checkWrap.createDiv({
          cls: "pe-stage-label",
          text: "Sub-concepts accurately retrieved:",
        });
        for (const concept of card.concepts) {
          const row = checkWrap.createEl("label", { cls: "pe-check-row" });
          const cb = row.createEl("input", { attr: { type: "checkbox" } });
          cb.checked = this.checkedConcepts.has(concept);
          cb.onchange = () => {
            if (cb.checked) this.checkedConcepts.add(concept);
            else this.checkedConcepts.delete(concept);
          };
          row.createSpan({ text: concept });
        }
      }

      const s2 = cardEl.createDiv({ cls: "pe-stage-box" });
      s2.createDiv({
        cls: "pe-stage-label",
        text: "Stage 2: Grade actual accuracy (Keys 1-5)",
      });
      const grid = s2.createDiv({ cls: "pe-btn-grid" });
      ACCURACY_DIAGNOSTICS.forEach((a, idx) => {
        const btn = grid.createEl("button", { cls: `pe-choice-btn ${a.css}` });
        btn.createSpan({ cls: "pe-choice-key", text: String(idx + 1) });
        const wrap = btn.createDiv({ cls: "pe-choice-textwrap" });
        wrap.createSpan({ cls: "pe-choice-label", text: a.label });
        wrap.createSpan({ cls: "pe-choice-hint", text: a.hint });
        btn.onclick = async () => {
          await this.submitReview(card, this.effort || "FAST_CONFIDENT", a.id);
        };
      });
    }
  }

  private toggleAllMaskingTapes(): void {
    const tapes = this.contentEl.querySelectorAll<HTMLElement>(
      ".pe-masking-tape, .pe-occlusion-tape"
    );
    if (!tapes.length) return;
    const anyMasked = Array.from(tapes).some((t) => !t.classList.contains("is-peeled"));
    tapes.forEach((t) => {
      t.classList.toggle("is-peeled", anyMasked);
      t.setAttribute("data-state", anyMasked ? "peeled" : "masked");
    });
  }

  private advanceCard(): void {
    this.pos++;
    this.stage = "question";
    this.effort = null;
    this.checkedConcepts.clear();
    this.render();
    setTimeout(() => this.contentEl.focus(), 50);
  }

  private async submitReview(
    card: IndexedCard,
    effortId: string,
    accuracyId: string
  ): Promise<void> {
    const updatedMeta = scheduleWithTsFsrs(
      card.meta,
      effortId,
      accuracyId,
      todayLocalStr(),
      this.plugin.settings.targetRetention
    );
    await this.plugin.store.writeCardMetadata(card, updatedMeta);
    if (isLeechCard(updatedMeta)) {
      new Notice("Leech card detected — consider splitting or rewriting this question.");
    }
    this.advanceCard();
  }

  private renderCardBrowser(root: HTMLElement): void {
    const bar = root.createDiv({ cls: "pe-search-bar-wrap" });
    const sInput = bar.createEl("input", {
      cls: "pe-search-input-pill",
      attr: {
        type: "text",
        placeholder: "Search questions, answers, #tags, concepts, or subjects...",
      },
    });
    sInput.value = this.searchQuery;

    const toolbar = root.createDiv({ cls: "pe-browser-toolbar" });
    const selectControls = toolbar.createDiv({ cls: "pe-select-btn-group" });
    const selectBar = toolbar.createDiv({ cls: "pe-batch-actions" });

    const tableWrap = root.createDiv({ cls: "pe-browser-table-wrap" });
    const table = tableWrap.createEl("table", { cls: "pe-browser-table" });
    const thead = table.createEl("thead");
    const tr = thead.createEl("tr");
    const body = table.createEl("tbody");

    const rerenderTable = () => {
      this.renderTableRows(body, selectBar);
      this.updateSelectionBar(selectBar);
    };

    sInput.oninput = () => {
      this.searchQuery = sInput.value.toLowerCase();
      rerenderTable();
    };

    selectControls.createEl("button", {
      cls: "pe-btn-secondary pe-btn-sm",
      text: "Select All",
    }).onclick = () => {
      for (const c of this.getFilteredCards()) this.selectedKeys.add(c.key);
      rerenderTable();
    };

    selectControls.createEl("button", {
      cls: "pe-btn-secondary pe-btn-sm",
      text: "Select None",
    }).onclick = () => {
      this.selectedKeys.clear();
      rerenderTable();
    };

    selectControls.createEl("button", {
      cls: "pe-btn-secondary pe-btn-sm",
      text: "Invert",
    }).onclick = () => {
      for (const c of this.getFilteredCards()) {
        if (this.selectedKeys.has(c.key)) this.selectedKeys.delete(c.key);
        else this.selectedKeys.add(c.key);
      }
      rerenderTable();
    };

    // Column visibility popover (uses view-level registered window click handler)
    const colMenuWrap = selectControls.createDiv({ cls: "pe-col-menu-wrap" });
    const colBtn = colMenuWrap.createEl("button", {
      cls: "pe-btn-secondary pe-btn-sm",
      text: "Columns",
    });
    const colPopover = colMenuWrap.createDiv({ cls: "pe-col-popover pe-hidden" });
    this.activePopover = colPopover;

    colBtn.onclick = (e) => {
      e.stopPropagation();
      colPopover.toggleClass("pe-hidden", !colPopover.hasClass("pe-hidden"));
    };
    colPopover.onclick = (e) => e.stopPropagation();

    const columnsList: Array<[keyof typeof this.plugin.settings.visibleColumns, string]> = [
      ["topic", "Topic Note"],
      ["type", "Type"],
      ["difficulty", "Difficulty"],
      ["interval", "Interval"],
      ["reps", "Reps"],
      ["due", "Due Date"],
    ];
    for (const [key, label] of columnsList) {
      const row = colPopover.createEl("label", { cls: "pe-col-check-row" });
      const cb = row.createEl("input", { attr: { type: "checkbox" } });
      cb.checked = this.plugin.settings.visibleColumns[key] !== false;
      row.createSpan({ text: label });
      cb.onchange = async () => {
        this.plugin.settings.visibleColumns[key] = cb.checked;
        await this.plugin.saveSettings();
        this.render();
      };
    }

    const thSelect = tr.createEl("th", { attr: { style: "width: 38px;" } });
    const masterCb = thSelect.createEl("input", { attr: { type: "checkbox" } });
    masterCb.onchange = () => {
      const filtered = this.getFilteredCards();
      if (masterCb.checked) filtered.forEach((c) => this.selectedKeys.add(c.key));
      else this.selectedKeys.clear();
      rerenderTable();
    };

    const vc = this.plugin.settings.visibleColumns;
    if (vc.topic !== false) tr.createEl("th", { text: "Topic Note" });
    if (vc.type !== false) tr.createEl("th", { text: "Type" });
    tr.createEl("th", { text: "Question Snippet" });
    if (vc.difficulty !== false) tr.createEl("th", { text: "Difficulty" });
    if (vc.interval !== false) tr.createEl("th", { text: "Interval" });
    if (vc.reps !== false) tr.createEl("th", { text: "Reps" });
    if (vc.due !== false) tr.createEl("th", { text: "Due Date" });
    tr.createEl("th", { text: "Actions", attr: { style: "width: 150px;" } });

    rerenderTable();
  }

  private getFilteredCards(): IndexedCard[] {
    if (!this.searchQuery) return this.allCards;
    return this.allCards.filter(
      (c) =>
        c.questionMd.toLowerCase().includes(this.searchQuery) ||
        c.answerMd.toLowerCase().includes(this.searchQuery) ||
        c.fileBasename.toLowerCase().includes(this.searchQuery) ||
        c.tags.some(
          (t) =>
            t.toLowerCase().includes(this.searchQuery) ||
            `#${t.toLowerCase()}`.includes(this.searchQuery)
        ) ||
        c.concepts.some((x) => x.toLowerCase().includes(this.searchQuery)) ||
        c.subjects.some((s) => s.toLowerCase().includes(this.searchQuery))
    );
  }

  private updateSelectionBar(container: HTMLElement): void {
    container.empty();
    const count = this.selectedKeys.size;
    if (count === 0) return;

    container.createSpan({
      cls: "pe-batch-badge",
      text: `${count} card${count > 1 ? "s" : ""} selected`,
    });

    const syncSelBtn = container.createEl("button", {
      cls: "pe-btn-secondary pe-btn-sm",
      text: `Sync Selected (${count})`,
    });
    syncSelBtn.onclick = async () => {
      const selected = this.allCards.filter((c) => this.selectedKeys.has(c.key));
      await this.plugin.runAnkiSync(selected);
    };

    const deleteBtn = container.createEl("button", {
      cls: "pe-btn-danger pe-btn-sm",
      text: `Delete Selected (${count})`,
    });
    deleteBtn.onclick = () => {
      const selected = this.allCards.filter((c) => this.selectedKeys.has(c.key));
      new DeleteConfirmModal(this.app, count, async () => {
        const deleted = await this.plugin.store.deleteCards(selected);
        this.selectedKeys.clear();
        new Notice(`Deleted ${deleted} question(s).`);
        await this.plugin.index.rebuildAll();
      }).open();
    };
  }

  private renderTableRows(body: HTMLElement, selectBar: HTMLElement): void {
    body.empty();
    const vc = this.plugin.settings.visibleColumns;
    const clampCls = `pe-preview-clamp-${this.plugin.settings.previewLines || "2"}`;
    const filtered = this.getFilteredCards();

    filtered.forEach((card, idx) => {
      const tr = body.createEl("tr", {
        cls: this.selectedKeys.has(card.key) ? "is-selected" : "",
      });
      const selTd = tr.createEl("td", { cls: "pe-check-cell" });
      const cb = selTd.createEl("input", { attr: { type: "checkbox" } });
      cb.checked = this.selectedKeys.has(card.key);

      cb.onclick = (e) => {
        e.stopPropagation();
        if (e.shiftKey && this.lastClickedRowIdx !== -1) {
          const start = Math.min(this.lastClickedRowIdx, idx);
          const end = Math.max(this.lastClickedRowIdx, idx);
          for (let i = start; i <= end; i++) {
            const target = filtered[i];
            if (target) this.selectedKeys.add(target.key);
          }
        } else {
          if (cb.checked) this.selectedKeys.add(card.key);
          else this.selectedKeys.delete(card.key);
        }
        this.lastClickedRowIdx = idx;
        this.renderTableRows(body, selectBar);
        this.updateSelectionBar(selectBar);
      };

      if (vc.topic !== false) tr.createEl("td", { text: card.fileBasename });
      if (vc.type !== false) tr.createEl("td", { text: card.type });

      const qCell = tr.createEl("td");
      if (isLeechCard(card.meta)) {
        qCell.createSpan({ cls: "pe-badge-alert pe-inline-badge", text: "Leech" });
      }
      qCell.createDiv({ cls: clampCls, text: card.questionMd });

      if (vc.difficulty !== false) tr.createEl("td", { text: card.difficulty });
      if (vc.interval !== false) tr.createEl("td", { text: `${card.meta.ivl}d` });
      if (vc.reps !== false) tr.createEl("td", { text: String(card.meta.reps) });
      if (vc.due !== false) tr.createEl("td", { text: card.meta.due });

      const actCell = tr.createEl("td", { cls: "pe-action-cell" });
      const editBtn = actCell.createEl("button", {
        cls: "pe-btn-secondary pe-btn-xs",
        text: "Edit",
      });
      editBtn.onclick = () => new QuestionEditorModal(this.app, this.plugin, card).open();

      const openBtn = actCell.createEl("button", {
        cls: "pe-btn-secondary pe-btn-xs",
        text: "Open",
      });
      openBtn.onclick = () => {
        const file = this.app.vault.getAbstractFileByPath(card.filePath);
        if (file instanceof TFile) {
          void this.app.workspace.getLeaf("tab").openFile(file, {
            eState: { line: card.startLine },
          });
        }
      };

      const delBtn = actCell.createEl("button", {
        cls: "pe-btn-icon-danger pe-btn-xs",
        text: "Del",
        attr: { title: "Delete question" },
      });
      delBtn.onclick = () => {
        new DeleteConfirmModal(this.app, 1, async () => {
          await this.plugin.store.deleteCards([card]);
          await this.plugin.index.rebuildAll();
        }).open();
      };
    });
  }

  private renderAnalyticsReport(root: HTMLElement): void {
    const totalCards = this.allCards.length;
    const totalAttempts = this.allCards.reduce((acc, c) => acc + (c.meta.attempts || 0), 0);
    const totalLapses = this.allCards.reduce((acc, c) => acc + (c.meta.lapses || 0), 0);
    const retentionRate =
      totalAttempts > 0 ? Math.round(((totalAttempts - totalLapses) / totalAttempts) * 100) : 100;

    const dateCounts: Record<string, number> = {};
    for (const c of this.allCards) {
      for (const h of c.meta.hist || []) {
        const d = h.split(":")[0];
        if (d) dateCounts[d] = (dateCounts[d] ?? 0) + 1;
      }
    }

    const today = todayLocalStr();
    let streak = 0;
    let cursor = dateCounts[today] ? today : addLocalDays(today, -1);
    while ((dateCounts[cursor] ?? 0) > 0) {
      streak++;
      cursor = addLocalDays(cursor, -1);
    }

    const statsGrid = root.createDiv({ cls: "pe-analytics-grid" });
    const addKpi = (val: string, lbl: string) => {
      const box = statsGrid.createDiv({ cls: "pe-stat-card" });
      box.createDiv({ cls: "pe-stat-val", text: val });
      box.createDiv({ cls: "pe-stat-lbl", text: lbl });
    };
    addKpi(String(totalCards), "Total Questions");
    addKpi(String(totalAttempts), "Lifetime Reviews");
    addKpi(`${streak} days`, "Current Streak");
    addKpi(`${retentionRate}%`, "Observed Retention");

    const heatHeader = root.createDiv({ cls: "pe-time-range-bar" });
    heatHeader.createEl("h3", { text: "Review Activity Heatmap" });

    const rangeSeg = heatHeader.createDiv({ cls: "pe-seg" });
    const ranges: Array<["30" | "90" | "180" | "365", string]> = [
      ["30", "30 Days"],
      ["90", "90 Days"],
      ["180", "180 Days"],
      ["365", "1 Year"],
    ];
    for (const [val, label] of ranges) {
      const btn = rangeSeg.createEl("button", {
        cls: `pe-seg-btn ${this.heatmapRange === val ? "is-active" : ""}`,
        text: label,
      });
      btn.onclick = () => {
        this.heatmapRange = val;
        this.render();
      };
    }

    const heatmapBox = root.createDiv({ cls: "pe-heatmap-wrap" });
    this.renderHeatmap(heatmapBox, dateCounts);

    // Topic calibration table
    const topicsMap = new Map<
      string,
      {
        name: string;
        subject: string;
        cards: number;
        attempts: number;
        lapses: number;
        confidentFlaws: number;
        lastTried: string;
      }
    >();

    for (const c of this.allCards) {
      let entry = topicsMap.get(c.fileBasename);
      if (!entry) {
        entry = {
          name: c.fileBasename,
          subject: c.subjects.length ? c.subjects.join(", ") : "General",
          cards: 0,
          attempts: 0,
          lapses: 0,
          confidentFlaws: 0,
          lastTried: "Never",
        };
        topicsMap.set(c.fileBasename, entry);
      }
      entry.cards++;
      entry.attempts += c.meta.attempts || 0;
      entry.lapses += c.meta.lapses || 0;
      for (const h of c.meta.hist || []) {
        const [d, , acc] = h.split(":");
        if (acc === "CF") entry.confidentFlaws++;
        if (d && (entry.lastTried === "Never" || d > entry.lastTried)) entry.lastTried = d;
      }
    }

    const highRisk = Array.from(topicsMap.values()).filter((t) => t.confidentFlaws >= 2);
    if (highRisk.length) {
      const alertBox = root.createDiv({ cls: "pe-alert-box" });
      alertBox.createEl("h4", { text: "Metacognitive Calibration Alert" });
      alertBox.createEl("p", {
        text: `Repeated Confident Misconceptions detected in: ${highRisk.map((t) => t.name).join(", ")}. Revisit the source notes to repair conceptual models.`,
      });
    }

    root.createEl("h3", { text: "Topic Breakdown & Diagnostic Log" });
    const tableWrap = root.createDiv({ cls: "pe-browser-table-wrap" });
    const table = tableWrap.createEl("table", { cls: "pe-browser-table" });
    const tr = table.createEl("thead").createEl("tr");
    ["Topic Note", "Subject", "Cards", "Reviews", "Last Tried", "Lapses", "Status"].forEach((h) =>
      tr.createEl("th", { text: h })
    );

    const tbody = table.createEl("tbody");
    for (const t of topicsMap.values()) {
      const row = tbody.createEl("tr");
      row.createEl("td", { text: t.name });
      row.createEl("td", { text: t.subject });
      row.createEl("td", { text: String(t.cards) });
      row.createEl("td", { text: String(t.attempts) });
      row.createEl("td", { text: t.lastTried });
      row.createEl("td", { text: String(t.lapses) });

      const statusCell = row.createEl("td");
      if (t.confidentFlaws >= 2) {
        statusCell.createSpan({ cls: "pe-badge-alert", text: "Conceptual Flaw" });
      } else if (t.attempts > 0 && t.lapses / t.attempts > 0.3) {
        statusCell.createSpan({ cls: "pe-badge-alert", text: "Needs Review" });
      } else if (t.attempts > 0) {
        statusCell.createSpan({ cls: "pe-badge-good", text: "On Track" });
      } else {
        statusCell.createSpan({ cls: "pe-opt-empty", text: "Untested" });
      }
    }
  }

  private renderHeatmap(container: HTMLElement, dateCounts: Record<string, number>): void {
    const rangeDays = parseInt(this.heatmapRange, 10) || 365;
    const today = todayLocalStr();
    const totalDays = Math.ceil(rangeDays / 7) * 7;
    const startStr = addLocalDays(today, -totalDays + 1);

    let periodReviews = 0;
    let activeDays = 0;
    let maxDay = 0;
    for (let i = 0; i < totalDays; i++) {
      const count = dateCounts[addLocalDays(startStr, i)] ?? 0;
      if (count > 0) {
        periodReviews += count;
        activeDays++;
        if (count > maxDay) maxDay = count;
      }
    }

    const wrap = container.createDiv({ cls: `pe-heatmap-wrap-inner pe-range-${rangeDays}` });
    const gridCol = wrap.createDiv({ cls: "pe-heatmap-grid-col" });
    const grid = gridCol.createDiv({ cls: `pe-heatmap-grid pe-grid-${rangeDays}` });

    for (let i = 0; i < totalDays; i++) {
      const curDate = addLocalDays(startStr, i);
      const count = dateCounts[curDate] ?? 0;
      const level = count >= 10 ? 4 : count >= 6 ? 3 : count >= 3 ? 2 : count >= 1 ? 1 : 0;
      grid.createDiv({
        cls: `pe-heatmap-cell pe-heat-lvl-${level}`,
        attr: { title: `${curDate}: ${count} review${count !== 1 ? "s" : ""}` },
      });
    }

    const legend = gridCol.createDiv({ cls: "pe-heatmap-legend" });
    legend.createSpan({ text: `Past ${rangeDays} days · Less` });
    for (const lvl of [0, 1, 2, 3, 4]) {
      legend.createDiv({ cls: `pe-heatmap-cell pe-heat-lvl-${lvl}` });
    }
    legend.createSpan({ text: "More" });

    const statsCol = wrap.createDiv({ cls: "pe-heatmap-period-stats" });
    statsCol.createEl("h4", { text: `Past ${rangeDays} Days Summary` });
    const mGrid = statsCol.createDiv({ cls: "pe-period-metrics-grid" });
    const addMetric = (num: string, lbl: string) => {
      const m = mGrid.createDiv({ cls: "pe-period-metric" });
      m.createDiv({ cls: "pe-metric-num", text: num });
      m.createDiv({ cls: "pe-metric-label", text: lbl });
    };
    addMetric(String(periodReviews), "Reviews in Period");
    addMetric(`${activeDays}/${rangeDays}d`, `Active (${Math.round((activeDays / rangeDays) * 100)}%)`);
    addMetric(`${(periodReviews / rangeDays).toFixed(1)}/d`, "Daily Pace");
    addMetric(String(maxDay), "Best Single Day");
  }

  private renderSyncAndTools(root: HTMLElement): void {
    const grid = root.createDiv({ cls: "pe-tools-grid" });

    // Card 1: AnkiConnect Bridge
    const ankiCard = grid.createDiv({ cls: "pe-tool-card" });
    ankiCard.createEl("h3", { text: "AnkiConnect Sync Bridge" });
    ankiCard.createEl("p", {
      cls: "pe-dashboard-subtitle",
      text: `Endpoint: ${this.plugin.settings.ankiConnectUrl} · Deck: ${this.plugin.settings.ankiDefaultDeck} · Mode: ${this.plugin.settings.ankiSyncMode}`,
    });
    const statusBadge = ankiCard.createDiv({
      cls: `pe-status-pill ${this.ankiStatusOk === true ? "is-ok" : this.ankiStatusOk === false ? "is-err" : ""}`,
      text: `Status: ${this.ankiStatusText}`,
    });

    const ankiActions = ankiCard.createDiv({ cls: "pe-tool-actions" });
    const testBtn = ankiActions.createEl("button", {
      cls: "pe-btn-secondary",
      text: "Test Connection",
    });
    testBtn.onclick = async () => {
      testBtn.disabled = true;
      const res = await this.plugin.anki.checkConnection();
      this.ankiStatusOk = res.ok;
      this.ankiStatusText = res.ok
        ? `Connected (AnkiConnect v${res.version})`
        : `Offline (${res.error || "unreachable"})`;
      statusBadge.textContent = `Status: ${this.ankiStatusText}`;
      statusBadge.className = `pe-status-pill ${res.ok ? "is-ok" : "is-err"}`;
      testBtn.disabled = false;
    };

    const syncAllBtn = ankiActions.createEl("button", {
      cls: "pe-btn-primary",
      text: `Run Active Sync (${this.allCards.length} cards)`,
    });
    syncAllBtn.onclick = async () => {
      syncAllBtn.disabled = true;
      try {
        await this.plugin.runAnkiSync();
      } finally {
        syncAllBtn.disabled = false;
      }
    };

    // Card 2: Export & Optimizer Tools
    const exportCard = grid.createDiv({ cls: "pe-tool-card" });
    exportCard.createEl("h3", { text: "Exporters & FSRS4Anki Optimizer" });
    exportCard.createEl("p", {
      cls: "pe-dashboard-subtitle",
      text: "Copy cards in Obsidian_to_Anki block syntax or export review logs for FSRS parameter optimization.",
    });
    const expActions = exportCard.createDiv({ cls: "pe-tool-actions" });

    expActions.createEl("button", {
      cls: "pe-btn-secondary",
      text: "Copy Obsidian_to_Anki Blocks",
    }).onclick = async () => {
      const blocks = this.allCards
        .map((c) => this.plugin.anki.formatObsidianToAnkiBlock(c))
        .join("\n\n");
      await navigator.clipboard.writeText(blocks);
      new Notice(`Copied ${this.allCards.length} Obsidian_to_Anki block(s).`);
    };

    expActions.createEl("button", {
      cls: "pe-btn-secondary",
      text: "Copy FSRS4Anki Review Log JSON",
    }).onclick = async () => {
      const json = this.plugin.anki.exportFsrs4AnkiReviewLog(this.allCards);
      await navigator.clipboard.writeText(json);
      new Notice("Copied FSRS4Anki review log JSON to clipboard.");
    };

    // Card 3: Vault Index & Migration Tools
    const vaultCard = grid.createDiv({ cls: "pe-tool-card" });
    vaultCard.createEl("h3", { text: "Vault Index, Migration & AI Prompt" });
    vaultCard.createEl("p", {
      cls: "pe-dashboard-subtitle",
      text: `Watching folder "${this.plugin.settings.practiceFolder || "/"}". ${this.allCards.length} card(s) currently indexed.`,
    });
    const vActions = vaultCard.createDiv({ cls: "pe-tool-actions" });

    vActions.createEl("button", {
      cls: "pe-btn-secondary",
      text: "Rebuild Card Index",
    }).onclick = async () => {
      await this.plugin.index.rebuildAll();
      new Notice(`Rebuilt index: ${this.plugin.index.getAllCards().length} card(s) found.`);
    };

    vActions.createEl("button", {
      cls: "pe-btn-secondary",
      text: "Import <!--SR:...--> Cards",
    }).onclick = async () => {
      await this.plugin.store.importSpacedRepetitionCards(this.plugin.index.getPracticeFiles());
      await this.plugin.index.rebuildAll();
    };

    vActions.createEl("button", {
      cls: "pe-btn-secondary",
      text: "Copy AI Card Prompt",
    }).onclick = async () => {
      await navigator.clipboard.writeText(AI_CARD_PROMPT);
      new Notice("Copied AI flashcard writing prompt to clipboard.");
    };
  }

  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
      return;
    }

    if (e.key === "Escape" && this.sessionActive) {
      e.preventDefault();
      this.sessionActive = false;
      this.refreshFromIndex();
      return;
    }
    if (!this.sessionActive || !this.queue.length || this.pos >= this.queue.length) return;

    if (e.key.toLowerCase() === "t") {
      e.preventDefault();
      this.toggleAllMaskingTapes();
      return;
    }

    if (e.key >= "1" && e.key <= "6") {
      const idx = parseInt(e.key, 10) - 1;
      const effortChoice = RETRIEVAL_EFFORTS[idx];
      const accChoice = ACCURACY_DIAGNOSTICS[idx];
      if (this.stage === "question" && effortChoice) {
        e.preventDefault();
        this.effort = effortChoice.id;
        this.stage = "answer";
        this.render();
      } else if (this.stage === "answer" && accChoice) {
        e.preventDefault();
        void this.submitReview(
          this.queue[this.pos]!,
          this.effort || "FAST_CONFIDENT",
          accChoice.id
        );
      }
    } else if ((e.key === " " || e.key === "Enter") && this.stage === "question") {
      e.preventDefault();
      this.effort = "FAST_CONFIDENT";
      this.stage = "answer";
      this.render();
    } else if (e.key === "ArrowRight" && this.stage === "question") {
      e.preventDefault();
      this.advanceCard();
    }
  }
}
