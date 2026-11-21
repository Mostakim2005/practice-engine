import { TFile, type App } from "obsidian";
import type { IndexedCard, PracticeSettings } from "../types";
import { isLeechCard, todayLocalStr } from "./fsrs-adapter";
import { parseCardsFromMarkdown } from "./markdown-ast";

const REBUILD_CONCURRENCY = 16;
const DEBOUNCE_MS = 250;

export class DerivedCardIndex {
  private byFile = new Map<string, IndexedCard[]>();
  private fileVersions = new Map<string, number>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private listeners = new Set<() => void>();
  private rebuildEpoch = 0;

  constructor(private app: App, private getSettings: () => PracticeSettings) {}

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error("[Practice Engine] Index listener error:", err);
      }
    }
  }

  isPracticeFile(path: string): boolean {
    const folder = (this.getSettings().practiceFolder || "").replace(/^\/+|\/+$/g, "");
    return !folder || path === folder || path.startsWith(`${folder}/`);
  }

  getPracticeFiles(): TFile[] {
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => this.isPracticeFile(f.path))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  private getFrontmatterSubjects(file: TFile): string[] {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm || !fm.subject) return [];
    if (Array.isArray(fm.subject)) {
      return fm.subject.map((s) => String(s).trim()).filter(Boolean);
    }
    const val = String(fm.subject).trim();
    return val ? [val] : [];
  }

  async rebuildAll(): Promise<void> {
    const epoch = ++this.rebuildEpoch;
    this.clearTimers();
    this.byFile.clear();

    const files = this.getPracticeFiles();
    for (let i = 0; i < files.length; i += REBUILD_CONCURRENCY) {
      if (epoch !== this.rebuildEpoch) return;
      const chunk = files.slice(i, i + REBUILD_CONCURRENCY);
      await Promise.all(chunk.map((f) => this.reindexFileInternal(f, false)));
    }
    if (epoch === this.rebuildEpoch) {
      this.emitChange();
    }
  }

  scheduleReindex(file: TFile): void {
    const existing = this.debounceTimers.get(file.path);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(file.path);
      void this.reindexFile(file);
    }, DEBOUNCE_MS);
    this.debounceTimers.set(file.path, timer);
  }

  async reindexFile(file: TFile): Promise<void> {
    await this.reindexFileInternal(file, true);
  }

  private async reindexFileInternal(file: TFile, notify: boolean): Promise<void> {
    if (!this.isPracticeFile(file.path)) {
      if (this.byFile.delete(file.path) && notify) this.emitChange();
      return;
    }

    const version = (this.fileVersions.get(file.path) ?? 0) + 1;
    this.fileVersions.set(file.path, version);

    try {
      const text = await this.app.vault.cachedRead(file);
      // Discard stale out-of-order read
      if (this.fileVersions.get(file.path) !== version) return;

      if (!text.includes("[!question]") && !text.includes("pe-card")) {
        this.byFile.delete(file.path);
      } else {
        const deck = this.getSettings().ankiDefaultDeck || file.basename;
        const subjects = this.getFrontmatterSubjects(file);
        const parsed = parseCardsFromMarkdown(text, file.path, deck, subjects);
        if (parsed.length > 0) {
          this.byFile.set(file.path, parsed);
        } else {
          this.byFile.delete(file.path);
        }
      }
      if (notify) this.emitChange();
    } catch (err) {
      console.error(`[Practice Engine] Failed to index ${file.path}:`, err);
    }
  }

  removeFile(path: string): void {
    const timer = this.debounceTimers.get(path);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(path);
    }
    this.fileVersions.delete(path);
    if (this.byFile.delete(path)) {
      this.emitChange();
    }
  }

  dispose(): void {
    this.clearTimers();
    this.listeners.clear();
  }

  private clearTimers(): void {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
  }

  getAllCards(): IndexedCard[] {
    const out: IndexedCard[] = [];
    for (const list of this.byFile.values()) out.push(...list);
    return out;
  }

  getDueCards(today = todayLocalStr()): IndexedCard[] {
    return this.getAllCards().filter((c) => c.meta.due <= today);
  }

  getStrugglingCards(): IndexedCard[] {
    return this.getAllCards().filter(
      (c) => (c.meta.d && c.meta.d >= 6.5) || c.meta.diff >= 3.3 || c.meta.lapses > 0
    );
  }

  getLeechCards(): IndexedCard[] {
    return this.getAllCards().filter((c) => isLeechCard(c.meta));
  }

  getAllSubjects(): string[] {
    const set = new Set<string>([
      "Physics",
      "Chemistry",
      "Biology",
      "Mathematics",
      "Computer Science",
      "General",
    ]);
    for (const card of this.getAllCards()) {
      for (const s of card.subjects) set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  getAllTags(): string[] {
    const set = new Set<string>();
    for (const card of this.getAllCards()) {
      for (const t of card.tags) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }
}
