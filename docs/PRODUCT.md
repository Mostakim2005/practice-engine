# Product Intent & Feature Map (`PRODUCT.md`)
> **1-Line Summary:** Topic-based active recall and spaced repetition engine with two-stage metacognitive review, official ts-fsrs scheduling, and multi-mode Anki sync.

## 1. Core Vision & User Experience Intent
* **What This App Does (Plain English):** Transforms vault notes into active recall flashcards with a metacognitive review step (predicting recall confidence before flipping) and spaced repetition scheduling powered by official `ts-fsrs`.
* **How It Must Feel to Use:** Fluid, distraction-free, keyboard-navigable card reviews with zero latency and seamless desktop Anki interoperability.

## 2. Active Features (Do Not Break)

### [FEATURE: Two-Stage-Metacognitive-Review] | Aliases: confidence rating, flashcard review, active recall
> **1-Line Summary:** Prompts user for a pre-reveal metacognitive confidence rating before displaying the answer.
* **Code Anchors (Grep Targets):**
  * `src/main.ts` -> `runAnkiSync`, `applyThemePreferences`

### [FEATURE: FSRS-Spaced-Repetition-Scheduler] | Aliases: fsrs algorithm, ts-fsrs, card scheduler
> **1-Line Summary:** Calculates optimum retention intervals using official ts-fsrs stability and difficulty equations.
* **Code Anchors (Grep Targets):**
  * `src/core/fsrs-adapter.ts` -> `scheduleWithTsFsrs`, `isLeechCard`

### [FEATURE: Anki-Bridge-And-Sync] | Aliases: anki sync, ankiconnect, obsidian to anki, fsrs4anki
> **1-Line Summary:** Bi-directional sync with desktop Anki collections, Obsidian_to_Anki export, and FSRS4Anki review logs.
* **Code Anchors (Grep Targets):**
  * `src/sync/anki-bridge.ts` -> `invokeAnkiConnect`, `pushCardToAnkiConnect`, `formatObsidianToAnkiBlock`, `exportFsrs4AnkiReviewLog`

### [FEATURE: Markdown-AST-Card-Indexer] | Aliases: card index, ast parsing, flashcard extraction
> **1-Line Summary:** In-memory reactive index extracting flashcards and metadata tags from vault markdown.
* **Code Anchors (Grep Targets):**
  * `src/core/markdown-ast.ts` -> `extractCardsFromMarkdown`
  * `src/core/card-index.ts` -> `DerivedCardIndex`

## 3. Planned Features & App-Merge Wishlist

### [WISHLIST: Live-Review-Modal-Port] | Aliases: review modal, study interface
> **1-Line Summary:** Complete full interactive two-stage review modal view port into modular TypeScript.
