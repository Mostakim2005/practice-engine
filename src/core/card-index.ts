import { TFile, type App } from "obsidian";
import type { IndexedCard, PracticeSettings } from "../types";
import { parseCardsFromMarkdown } from "./markdown-ast";

export class DerivedCardIndex {
  private byFile = new Map<string, IndexedCard[]>();

  constructor(private app: App, private getSettings: () => PracticeSettings) {}

  private isPracticeFile(path: string): boolean {
    const folder = (this.getSettings().practiceFolder || "").replace(/^\/+|\/+$/g, "");
    return !folder || path === folder || path.startsWith(`${folder}/`);
  }

  async rebuildAll(): Promise<void> {
    this.byFile.clear();
    const files = this.app.vault.getMarkdownFiles().filter((f) => this.isPracticeFile(f.path));
    await Promise.all(files.map((f) => this.reindexFile(f)));
  }

  async reindexFile(file: TFile): Promise<void> {
    if (!this.isPracticeFile(file.path)) {
      this.byFile.delete(file.path);
      return;
    }
    const text = await this.app.vault.cachedRead(file);
    const deck = this.getSettings().ankiDefaultDeck || file.basename;
    this.byFile.set(file.path, parseCardsFromMarkdown(text, file.path, deck));
  }

  removeFile(path: string): void {
    this.byFile.delete(path);
  }

  getAllCards(): IndexedCard[] {
    const out: IndexedCard[] = [];
    for (const list of this.byFile.values()) out.push(...list);
    return out;
  }
}
