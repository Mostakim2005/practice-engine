import { Component, MarkdownRenderer, Modal, Notice, type App } from "obsidian";
import type PracticeEnginePlugin from "../main";
import {
  COGNITIVE_TYPES,
  DIFFICULTY_LEVELS,
  type CardDraftInput,
  type IndexedCard,
} from "../types";
import {
  attachInteractiveTapeAndClozeListeners,
  processClozeAndTapeMarkdown,
} from "../core/markdown-ast";

export class DeleteConfirmModal extends Modal {
  constructor(
    app: App,
    private count: number,
    private onConfirm: () => Promise<void> | void,
    private label?: string
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.modalEl.addClass("pe-small-modal");
    contentEl.empty();

    contentEl.createEl("h3", {
      text: this.label ? `Delete "${this.label}"?` : `Delete ${this.count} question(s)?`,
    });
    contentEl.createEl("p", {
      cls: "pe-modal-desc",
      text: "This action modifies your vault Markdown file(s) and cannot be undone.",
    });

    const actions = contentEl.createDiv({ cls: "pe-modal-actions" });
    const cancelBtn = actions.createEl("button", { cls: "pe-btn-secondary", text: "Cancel" });
    cancelBtn.onclick = () => this.close();

    const confirmBtn = actions.createEl("button", { cls: "pe-btn-danger", text: "Delete" });
    confirmBtn.onclick = async () => {
      confirmBtn.disabled = true;
      try {
        await this.onConfirm();
        this.close();
      } catch (err) {
        new Notice(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
        confirmBtn.disabled = false;
      }
    };
  }
}

export class QuestionEditorModal extends Modal {
  private previewComponent = new Component();
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private isMaximized = false;

  private topicPath: string;
  private newTopicName = "";
  private cardType: string;
  private difficulty: string;
  private subjectsText: string;
  private tagsText: string;
  private conceptsText: string;
  private questionText: string;
  private answerText: string;
  private activeTextarea: HTMLTextAreaElement | null = null;

  constructor(
    app: App,
    private plugin: PracticeEnginePlugin,
    private cardToEdit: IndexedCard | null = null
  ) {
    super(app);
    this.topicPath =
      cardToEdit?.filePath || plugin.settings.lastTopicPath || "__new__";
    this.cardType = cardToEdit?.type || "Conceptual";
    this.difficulty = cardToEdit?.difficulty || "Moderate";
    this.subjectsText = (cardToEdit?.subjects || []).join(", ");
    this.tagsText = (cardToEdit?.tags || []).join(", ");
    this.conceptsText = (cardToEdit?.concepts || []).join(", ");
    this.questionText = cardToEdit?.questionMd || "";
    this.answerText = cardToEdit?.answerMd || "";
  }

  onOpen(): void {
    this.previewComponent.load();
    this.modalEl.addClass("pe-modal");
    this.build();
  }

  onClose(): void {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewComponent.unload();
    this.contentEl.empty();
  }

  private build(): void {
    const { contentEl } = this;
    contentEl.empty();

    const header = contentEl.createDiv({ cls: "pe-modal-header" });
    header.createEl("h3", {
      text: this.cardToEdit ? "Edit Practice Question" : "Add Practice Question",
    });

    const maxBtn = header.createEl("button", {
      cls: "pe-modal-max-btn",
      text: this.isMaximized ? "Restore" : "Maximize",
    });
    maxBtn.onclick = () => {
      this.isMaximized = !this.isMaximized;
      this.modalEl.toggleClass("is-maximized", this.isMaximized);
      maxBtn.textContent = this.isMaximized ? "Restore" : "Maximize";
    };

    const dual = contentEl.createDiv({ cls: "pe-dual-container" });
    const left = dual.createDiv({ cls: "pe-editor-pane" });
    const right = dual.createDiv({ cls: "pe-preview-pane" });

    // Destination topic (only when creating a new card)
    if (!this.cardToEdit) {
      const topicRow = left.createDiv({ cls: "pe-field-row" });
      topicRow.createEl("label", { cls: "pe-field-label", text: "Topic Note" });
      const topicSel = topicRow.createEl("select", { cls: "pe-select-pill" });
      topicSel.createEl("option", { text: "+ Create New Topic Note...", attr: { value: "__new__" } });
      for (const f of this.plugin.index.getPracticeFiles()) {
        topicSel.createEl("option", { text: f.basename, attr: { value: f.path } });
      }
      topicSel.value = this.topicPath;

      const newTopicInput = left.createEl("input", {
        cls: "pe-input",
        attr: { type: "text", placeholder: "New topic note title (e.g. Linear Algebra)" },
      });
      newTopicInput.style.display = this.topicPath === "__new__" ? "block" : "none";
      newTopicInput.value = this.newTopicName;
      newTopicInput.oninput = () => {
        this.newTopicName = newTopicInput.value;
      };

      topicSel.onchange = () => {
        this.topicPath = topicSel.value;
        newTopicInput.style.display = this.topicPath === "__new__" ? "block" : "none";
      };
    }

    // Metadata grid
    const metaGrid = left.createDiv({ cls: "pe-meta-grid" });

    const typeWrap = metaGrid.createDiv({ cls: "pe-field-row" });
    typeWrap.createEl("label", { cls: "pe-field-label", text: "Cognitive Type" });
    const typeSel = typeWrap.createEl("select", { cls: "pe-select-pill" });
    for (const t of COGNITIVE_TYPES) {
      typeSel.createEl("option", { text: t, attr: { value: t } });
    }
    typeSel.value = this.cardType;
    typeSel.onchange = () => {
      this.cardType = typeSel.value;
    };

    const diffWrap = metaGrid.createDiv({ cls: "pe-field-row" });
    diffWrap.createEl("label", { cls: "pe-field-label", text: "Difficulty" });
    const diffSel = diffWrap.createEl("select", { cls: "pe-select-pill" });
    for (const d of DIFFICULTY_LEVELS) {
      diffSel.createEl("option", { text: d, attr: { value: d } });
    }
    diffSel.value = this.difficulty;
    diffSel.onchange = () => {
      this.difficulty = diffSel.value;
    };

    const subRow = left.createDiv({ cls: "pe-field-row" });
    subRow.createEl("label", { cls: "pe-field-label", text: "Subjects (comma-separated)" });
    const subInput = subRow.createEl("input", {
      cls: "pe-input",
      attr: { type: "text", placeholder: "e.g. Physics, Calculus" },
    });
    subInput.value = this.subjectsText;
    subInput.oninput = () => {
      this.subjectsText = subInput.value;
    };

    const tagRow = left.createDiv({ cls: "pe-field-row" });
    tagRow.createEl("label", { cls: "pe-field-label", text: "Tags & Sub-Concepts" });
    const tagSplit = tagRow.createDiv({ cls: "pe-meta-grid" });
    const tagsInput = tagSplit.createEl("input", {
      cls: "pe-input",
      attr: { type: "text", placeholder: "Tags: exam, ch3" },
    });
    tagsInput.value = this.tagsText;
    tagsInput.oninput = () => {
      this.tagsText = tagsInput.value;
    };

    const conceptsInput = tagSplit.createEl("input", {
      cls: "pe-input",
      attr: { type: "text", placeholder: "Concepts: Eigenvalues, Orthogonality" },
    });
    conceptsInput.value = this.conceptsText;
    conceptsInput.oninput = () => {
      this.conceptsText = conceptsInput.value;
    };

    // Quick-insert toolbar for Cloze, Masking Tape, Inline/Display Math
    const toolbar = left.createDiv({ cls: "pe-quick-toolbar" });
    const addTool = (label: string, before: string, after = "") => {
      const btn = toolbar.createEl("button", {
        cls: "pe-btn-secondary pe-btn-xs",
        text: label,
        attr: { type: "button" },
      });
      btn.onclick = () => this.insertAroundCursor(before, after, previewBody);
    };
    addTool("Cloze ==x==", "==", "==");
    addTool("Anki Cloze", "{{c1::", "}}");
    addTool("Tape Mask", "==tape::", "::HINT==");
    addTool("Inline Math", "$", "$");
    addTool("Block Math", "$$\n", "\n$$");

    // Question textarea
    left.createEl("label", { cls: "pe-field-label", text: "Question (Markdown / LaTeX / Cloze)" });
    const qTa = left.createEl("textarea", {
      cls: "pe-textarea",
      attr: { rows: "5", placeholder: "Write the active recall prompt..." },
    });
    qTa.value = this.questionText;
    this.activeTextarea = qTa;
    qTa.onfocus = () => {
      this.activeTextarea = qTa;
    };
    qTa.oninput = () => {
      this.questionText = qTa.value;
      this.schedulePreview(previewBody);
    };

    // Answer textarea
    left.createEl("label", { cls: "pe-field-label", text: "Answer / Solution" });
    const aTa = left.createEl("textarea", {
      cls: "pe-textarea",
      attr: { rows: "5", placeholder: "Write the concise answer and reasoning..." },
    });
    aTa.value = this.answerText;
    aTa.onfocus = () => {
      this.activeTextarea = aTa;
    };
    aTa.oninput = () => {
      this.answerText = aTa.value;
      this.schedulePreview(previewBody);
    };

    // Live Preview pane
    right.createEl("div", { cls: "pe-stage-label", text: "Live Interactive Preview" });
    const previewBody = right.createDiv({ cls: "pe-preview-body" });
    void this.renderPreview(previewBody);

    // Footer actions
    const footer = contentEl.createDiv({ cls: "pe-modal-actions" });
    const cancelBtn = footer.createEl("button", { cls: "pe-btn-secondary", text: "Cancel" });
    cancelBtn.onclick = () => this.close();

    const saveBtn = footer.createEl("button", {
      cls: "pe-btn-primary",
      text: this.cardToEdit ? "Save Changes" : "Save Question",
    });
    saveBtn.onclick = async () => {
      if (!this.questionText.trim()) {
        new Notice("Question text cannot be empty.");
        return;
      }
      saveBtn.disabled = true;
      const draft: CardDraftInput = {
        type: this.cardType,
        difficulty: this.difficulty,
        subjects: this.subjectsText.split(",").map((s) => s.trim()).filter(Boolean),
        tags: this.tagsText.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean),
        concepts: this.conceptsText.split(",").map((c) => c.trim()).filter(Boolean),
        question: this.questionText.trim(),
        answer: this.answerText.trim(),
      };
      try {
        if (this.cardToEdit) {
          await this.plugin.store.updateCardContent(this.cardToEdit, draft);
          new Notice("Updated practice question.");
        } else {
          const savedFile = await this.plugin.store.addCard(
            {
              topicPath: this.topicPath,
              newTopic: this.newTopicName,
              subjects: draft.subjects,
            },
            draft
          );
          this.plugin.settings.lastTopicPath = savedFile.path;
          await this.plugin.saveSettings();
          await this.plugin.index.reindexFile(savedFile);
          new Notice(`Saved question to "${savedFile.basename}".`);
        }
        this.close();
      } catch (err) {
        new Notice(`Failed to save question: ${err instanceof Error ? err.message : String(err)}`);
        saveBtn.disabled = false;
      }
    };
  }

  private insertAroundCursor(before: string, after: string, previewBody: HTMLElement): void {
    const ta = this.activeTextarea;
    if (!ta) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const selected = ta.value.slice(start, end);
    const updated = ta.value.slice(0, start) + before + selected + after + ta.value.slice(end);
    ta.value = updated;
    const caret = start + before.length + selected.length;
    ta.setSelectionRange(caret, caret);
    ta.focus();
    ta.dispatchEvent(new Event("input"));
    this.schedulePreview(previewBody);
  }

  private schedulePreview(container: HTMLElement): void {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => {
      void this.renderPreview(container);
    }, 150);
  }

  private async renderPreview(container: HTMLElement): Promise<void> {
    container.empty();
    const sourcePath = this.cardToEdit?.filePath || "";

    const qSec = container.createDiv({ cls: "pe-question" });
    qSec.createDiv({ cls: "pe-stage-label", text: "Question (Click clozes/tapes to test)" });
    const qRender = qSec.createDiv();
    await MarkdownRenderer.render(
      this.app,
      processClozeAndTapeMarkdown(this.questionText || "_Empty question_", false),
      qRender,
      sourcePath,
      this.previewComponent
    );
    attachInteractiveTapeAndClozeListeners(qRender);

    const aSec = container.createDiv({ cls: "pe-answer" });
    aSec.createDiv({ cls: "pe-stage-label", text: "Answer" });
    const aRender = aSec.createDiv();
    await MarkdownRenderer.render(
      this.app,
      processClozeAndTapeMarkdown(this.answerText || "_Empty answer_", true),
      aRender,
      sourcePath,
      this.previewComponent
    );
    attachInteractiveTapeAndClozeListeners(aRender);
  }
}
