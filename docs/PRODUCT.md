# Product Intent & Feature Map (`PRODUCT.md`)
> **1-Line Summary:** Topic-based active recall and spaced repetition workstation with two-stage metacognitive review, official `ts-fsrs` scheduling, and multi-mode Anki export/push.

## 1. Core Vision & User Experience Intent
* **What This App Does (Plain English):** Transforms Obsidian vault notes into active recall flashcards with a two-stage metacognitive review loop (predicting retrieval effort before revealing the answer and grading accuracy), scheduled via official `ts-fsrs`.
* **How It Must Feel to Use:** Fluid, keyboard-first, distraction-free study sessions accessible in one click from the Obsidian ribbon, with instant card browsing, analytics, and local Anki interoperability.

## 2. Active Features (Do Not Break)

### [FEATURE: Two-Stage-Metacognitive-Review] | Aliases: confidence rating, flashcard review, active recall
> **1-Line Summary:** Interactive `PracticeView` workstation prompting for Stage 1 retrieval effort before revealing Stage 2 accuracy diagnostics and persisting `ts-fsrs` updates.
* **Code Anchors (Grep Targets):**
  * `src/ui/practice-view.ts` -> `PracticeView`, `renderActiveTesting`, `submitReview`
  * `src/ui/modals.ts` -> `QuestionEditorModal`

### [FEATURE: FSRS-Spaced-Repetition-Scheduler] | Aliases: fsrs algorithm, ts-fsrs, card scheduler
> **1-Line Summary:** Reconstructs `ts-fsrs` card state (`Review`/`Relearning`, `last_review`, `elapsed_days`) and calculates intervals with leech detection.
* **Code Anchors (Grep Targets):**
  * `src/core/fsrs-adapter.ts` -> `scheduleWithTsFsrs`, `mapTwoStageToFsrsGrade`, `isLeechCard`

### [FEATURE: Anki-Bridge-And-Sync] | Aliases: anki sync, ankiconnect, obsidian to anki, fsrs4anki
> **1-Line Summary:** Push sync to desktop Anki via AnkiConnect (with `ankiId` writeback and auto-model creation), `Obsidian_to_Anki` block export, and `FSRS4Anki` review log JSON export.
* **Code Anchors (Grep Targets):**
  * `src/sync/anki-bridge.ts` -> `invokeAnkiConnect`, `checkConnection`, `pushCardToAnkiConnect`, `formatObsidianToAnkiBlock`, `exportFsrs4AnkiReviewLog`
  * `src/main.ts` -> `runAnkiSync`

### [FEATURE: Markdown-AST-Card-Indexer] | Aliases: card index, ast parsing, flashcard extraction
> **1-Line Summary:** Debounced reactive in-memory index parsing both callout (`> [!question]`) and clean block (`%%pe-card%%`) cards with content-hash fallback IDs and XSS-safe cloze/tape rendering.
* **Code Anchors (Grep Targets):**
  * `src/core/markdown-ast.ts` -> `parseCardsFromMarkdown`, `parseCardMeta`, `serializeAlignedMeta`, `buildCardMarkdown`, `processClozeAndTapeMarkdown`
  * `src/core/card-index.ts` -> `DerivedCardIndex`, `scheduleReindex`, `rebuildAll`
  * `src/core/vault-store.ts` -> `VaultCardStore`, `writeCardMetadata`

## 3. Planned Features & App-Merge Wishlist

### [WISHLIST: True-BiDirectional-Anki-Pull] | Aliases: anki pull, revlog sync
> **1-Line Summary:** Pull review timestamps and updated stability/difficulty back from desktop Anki via AnkiConnect `cardsInfo` / `getReviewsOfCards`.

### [WISHLIST: In-Obsidian-FSRS-Optimizer] | Aliases: fsrs-browser, wasm optimizer
> **1-Line Summary:** Integrate `open-spaced-repetition/fsrs-browser` WASM optimizer to fit personalized FSRS weights directly inside the Analytics tab.
