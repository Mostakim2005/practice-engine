# Project Operating Instructions (`AGENTS.md`)
> **Notice:** This project inherits user persona, confirmation gates, visual standards, and documentation blueprints from the global master `AGENTS.md`. Do not duplicate those rules here.

## 1. Project Tech Stack & Environment
* **Runtime / Language:** Node.js v20+, TypeScript 5+, esbuild
* **Framework / Host:** Obsidian Plugin API (`obsidian`)
* **Scheduler:** Official [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) (`^5.0.0`)
* **Build Output:** Root `main.js`, `manifest.json`, `styles.css` (copy directly to `<Vault>/.obsidian/plugins/practice-engine/`)

## 2. Mandatory Verification & Build Commands
* **Type Check:** `npx tsc --noEmit`
* **Build / Package:** `npm run build`
* **Lint:** `npm run lint`

## 3. Repository Directory Structure & Conventions
* `src/main.ts` — Plugin lifecycle, ribbon buttons (`brain`, `plus`), commands, concurrency-locked Anki sync, and settings tab.
* `src/core/fsrs-adapter.ts` — Official `ts-fsrs` state reconstruction, two-stage grade mapping, leech detection, and local date math.
* `src/core/markdown-ast.ts` — Callout (`> [!question]`) and clean block (`%%pe-card%%`) parser, content-hash IDs, card builder, and XSS-safe cloze/tape renderer.
* `src/core/card-index.ts` — Debounced reactive in-memory card index with monotonic stale-read guard and bounded concurrency.
* `src/core/vault-store.ts` — Content-addressed Markdown CRUD persistence (`app.vault.process`) and `<!--SR:...-->` migration.
* `src/sync/anki-bridge.ts` — AnkiConnect HTTP client (auto-creating deck & `PracticeEngine-2Stage` note type), `Obsidian_to_Anki` block formatter, and `FSRS4Anki` JSON exporter.
* `src/ui/practice-view.ts` — 4-tab `ItemView` workstation (Study Queue + Two-Stage Review, Card Browser, Analytics/Heatmap, Sync & Tools).
* `src/ui/modals.ts` — Streamlined dual-pane `QuestionEditorModal` and `DeleteConfirmModal`.
* `docs/` — Core Markdown documentation suite (`PRODUCT.md`, `ARCHITECTURE.md`, `DECISIONS_AND_TRAPS.md`, `VISUAL_LOG.md`).

## 4. Critical Trap Pointers (1-Line Warnings Only)
* **TRAP 1:** Always reconstruct `ts-fsrs` `state`, `last_review`, and `elapsed_days` — see `docs/DECISIONS_AND_TRAPS.md` -> `[TRAP: TsFsrs-State-New-Reset]`.
* **TRAP 2:** Never rely on cached line offsets when mutating Markdown cards — see `docs/DECISIONS_AND_TRAPS.md` -> `[TRAP: AST-Line-Offset-Drift-On-Save]`.
* **TRAP 3:** Always wrap AnkiConnect calls in `try/catch` and persist returned `ankiNoteId` — see `docs/DECISIONS_AND_TRAPS.md` -> `[TRAP: AnkiConnect-Offline-Failures]`.
