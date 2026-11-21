import { Notice, TFile, type App } from "obsidian";
import type { CardDraftInput, CardMeta, IndexedCard, PracticeSettings } from "../types";
import { defaultMeta } from "./fsrs-adapter";
import {
  buildCardMarkdown,
  parseCardsFromMarkdown,
  serializeAlignedMeta,
} from "./markdown-ast";

export const AI_CARD_PROMPT = [
  "Generate active-recall flashcards formatted for Obsidian Practice Engine.",
  "Format each card as a callout:",
  "> [!question] Type:: Conceptual | Difficulty:: Moderate | Subjects:: <Subject> | Tags:: #<tag> | Concepts:: <concept1>, <concept2>",
  "> <Question text; use ==cloze== or ==tape::hidden::HINT== for masking>",
  ">",
  "> > [!answer]",
  "> > <Concise, clear answer with key reasoning steps>",
  "",
  "Rules: Keep one core concept per card, avoid vague questions, and include edge cases in Concepts.",
].join("\n");

export class VaultCardStore {
  constructor(private app: App, private getSettings: () => PracticeSettings) {}

  private folder(): string {
    return (this.getSettings().practiceFolder || "").replace(/^\/+|\/+$/g, "");
  }

  async ensureFolder(folderPath: string): Promise<void> {
    const parts = folderPath.split("/").filter(Boolean);
    let cur = "";
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) {
        await this.app.vault.createFolder(cur);
      }
    }
  }

  private getFile(path: string): TFile | null {
    const abstract = this.app.vault.getAbstractFileByPath(path);
    return abstract instanceof TFile ? abstract : null;
  }

  async writeCardMetadata(card: IndexedCard, newMeta: CardMeta): Promise<boolean> {
    const file = this.getFile(card.filePath);
    if (!file) return false;

    const includeSR = this.getSettings().enableObsidianSRCompat !== false;
    let updated = false;

    await this.app.vault.process(file, (data) => {
      const freshCards = parseCardsFromMarkdown(data, file.path, card.deck, card.subjects);
      const fresh = freshCards.find(
        (c) => c.meta.id === card.meta.id || c.key === card.key
      );
      if (!fresh) return data;

      const lines = data.replace(/\r\n?/g, "\n").split("\n");
      const metaStr = serializeAlignedMeta(newMeta, includeSR);
      if (fresh.metaLine !== -1) {
        lines[fresh.metaLine] = metaStr;
      } else {
        lines.splice(fresh.endLine + 1, 0, metaStr);
      }
      updated = true;
      return lines.join("\n");
    });

    if (updated) {
      card.meta = newMeta;
    }
    return updated;
  }

  async updateCardContent(card: IndexedCard, draft: CardDraftInput): Promise<boolean> {
    const file = this.getFile(card.filePath);
    if (!file) return false;

    const settings = this.getSettings();
    let updated = false;

    await this.app.vault.process(file, (data) => {
      const freshCards = parseCardsFromMarkdown(data, file.path, card.deck, card.subjects);
      const fresh = freshCards.find(
        (c) => c.meta.id === card.meta.id || c.key === card.key
      );
      if (!fresh) return data;

      const lines = data.replace(/\r\n?/g, "\n").split("\n");
      const replacement = buildCardMarkdown(
        draft,
        fresh.meta,
        fresh.format || settings.cardFormat || "callout",
        settings.enableObsidianSRCompat !== false
      );
      const deleteCount =
        (fresh.metaLine !== -1 ? fresh.metaLine : fresh.endLine) - fresh.startLine + 1;
      lines.splice(fresh.startLine, deleteCount, replacement);
      updated = true;
      return lines.join("\n");
    });

    return updated;
  }

  async addCard(
    target: { topicPath: string; newTopic?: string; subjects: string[] },
    draft: CardDraftInput
  ): Promise<TFile> {
    const settings = this.getSettings();
    const block = buildCardMarkdown(
      draft,
      defaultMeta(),
      settings.cardFormat || "callout",
      settings.enableObsidianSRCompat !== false
    );
    const folder = this.folder();

    let file: TFile | null = null;
    if (target.topicPath && target.topicPath !== "__new__") {
      file = this.getFile(target.topicPath);
      if (file) {
        await this.app.vault.process(file, (d) => `${d.trimEnd()}\n\n${block}\n`);
        return file;
      }
    }

    const rawName = (target.newTopic || "General Practice")
      .replace(/[\\/:*?"<>|#^[\]]/g, "")
      .trim();
    const safeName = rawName || "General Practice";
    const path = folder ? `${folder}/${safeName}.md` : `${safeName}.md`;
    const existing = this.getFile(path);

    if (existing) {
      await this.app.vault.process(existing, (d) => `${d.trimEnd()}\n\n${block}\n`);
      return existing;
    }

    if (folder) await this.ensureFolder(folder);
    const subList = target.subjects.length ? target.subjects : ["General"];
    const tagList = [
      "practice",
      ...subList.map((s) => s.toLowerCase().replace(/\s+/g, "-")),
    ];
    const content = [
      "---",
      `topic: "${safeName}"`,
      `subject: [${subList.map((s) => `"${s}"`).join(", ")}]`,
      `tags: [${tagList.map((t) => `"${t}"`).join(", ")}]`,
      "---",
      "",
      "## Practice Questions",
      "",
      block,
      "",
    ].join("\n");

    return await this.app.vault.create(path, content);
  }

  async deleteCards(cardsToDelete: IndexedCard[]): Promise<number> {
    const byPath = new Map<string, IndexedCard[]>();
    for (const card of cardsToDelete) {
      const list = byPath.get(card.filePath) ?? [];
      list.push(card);
      byPath.set(card.filePath, list);
    }

    let removedTotal = 0;
    for (const [path, cards] of byPath.entries()) {
      const file = this.getFile(path);
      if (!file) continue;

      await this.app.vault.process(file, (data) => {
        const freshCards = parseCardsFromMarkdown(data, file.path, "");
        const toRemove = freshCards.filter((fc) =>
          cards.some((c) => c.meta.id === fc.meta.id || c.key === fc.key)
        );
        if (!toRemove.length) return data;

        toRemove.sort((a, b) => b.startLine - a.startLine);
        const lines = data.replace(/\r\n?/g, "\n").split("\n");
        for (const card of toRemove) {
          const end = card.metaLine !== -1 ? card.metaLine : card.endLine;
          let deleteCount = end - card.startLine + 1;
          if (lines[card.startLine + deleteCount]?.trim() === "") {
            deleteCount += 1;
          }
          lines.splice(card.startLine, deleteCount);
          removedTotal++;
        }
        return lines.join("\n");
      });
    }

    return removedTotal;
  }

  async importSpacedRepetitionCards(files: TFile[]): Promise<number> {
    const includeSR = this.getSettings().enableObsidianSRCompat !== false;
    let count = 0;

    for (const file of files) {
      await this.app.vault.process(file, (data) => {
        const lines = data.replace(/\r\n?/g, "\n").split("\n");
        let modified = false;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          const srMatch = line.match(/<!--SR:!(\d{4}-\d{2}-\d{2}),(\d+),(\d+)-->/);
          if (srMatch && !line.includes("pe-meta:")) {
            const due = srMatch[1]!;
            const ivl = Math.max(1, parseInt(srMatch[2] || "1", 10) || 1);
            const ease = parseInt(srMatch[3] || "250", 10) || 250;
            const diff = Math.max(1.0, Math.min(5.0, (280 - ease) / 30));
            const meta = defaultMeta();
            meta.due = due;
            meta.ivl = ivl;
            meta.diff = Number(diff.toFixed(1));
            meta.s = Number(ivl.toFixed(2));
            meta.d = Number((diff * 2).toFixed(2));
            lines[i] = serializeAlignedMeta(meta, includeSR);
            modified = true;
            count++;
          }
        }
        return modified ? lines.join("\n") : data;
      });
    }

    if (count > 0) {
      new Notice(`Imported ${count} card(s) from Obsidian Spaced Repetition tags.`);
    } else {
      new Notice("No unlinked <!--SR:...--> cards found in practice folder.");
    }
    return count;
  }
}
