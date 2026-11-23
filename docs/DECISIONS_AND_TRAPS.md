# Architectural Decisions, Pivots & Landmines (`DECISIONS_AND_TRAPS.md`)
> **1-Line Summary:** Architectural pivots, library decisions, and verified engineering landmines for Practice Engine v3.0.0.

## 1. Architectural Decisions & Pivot History

### [DECISION: Official-TsFsrs-Adoption-And-Modular-Architecture]
* Replaced custom FSRS/SM-2 prototype math with official `ts-fsrs` (`^5.0.0`) and modular TypeScript subsystems (`src/core/`, `src/sync/`, `src/ui/`).

### [DECISION: Purge-Legacy-Runtime-Bundle-And-Salvage-UI]
* Eliminated the 4,056-line monolithic `runtime/main.js` bundle while salvaging the ribbon buttons, 4-tab `PracticeView` workstation, cloze/masking-tape engine, heatmap analytics, and streamlined `QuestionEditorModal` into strict TypeScript.
* Pruned brittle custom MATLAB/NaturalMath regexes and the DOM-mirror `TextareaLinkAutocompleter` in favor of native Obsidian editing and the LaTeX Toolbox bridge.

## 2. Do-Not-Touch Engineering Landmines (Traps)

### [TRAP: TsFsrs-State-New-Reset]
* **Strict Rule:** When calling `ts-fsrs` `scheduler.next(baseCard, now, grade)` on any card with `attempts > 0`, **ALWAYS** set `baseCard.state` (`State.Review` or `State.Relearning`), `baseCard.last_review`, and `baseCard.elapsed_days`. Leaving `createEmptyCard()` at `State.New` resets stability to initial values on every review.
* **Protected Code Anchor:** `src/core/fsrs-adapter.ts` -> `scheduleWithTsFsrs`

### [TRAP: AST-Line-Offset-Drift-On-Save]
* **Strict Rule:** Never mutate a vault file using cached `startLine`/`metaLine` offsets. Always re-parse inside `app.vault.process(...)` and match by stable `card.meta.id` (content-hashed fallback `h_<fnv1a>` when unrated, never line-index `c_${i}`).
* **Protected Code Anchors:** `src/core/vault-store.ts` -> `writeCardMetadata`, `src/core/markdown-ast.ts` -> `parseCardsFromMarkdown`

### [TRAP: AnkiConnect-Offline-Failures]
* **Strict Rule:** Always wrap AnkiConnect calls in `try/catch`, guard `runAnkiSync` with an `isSyncing` lock, ensure the target deck and `PracticeEngine-2Stage` note model exist before `addNote`, and persist the returned `ankiNoteId` back into `<!--pe-meta:...-->` so subsequent syncs update instead of duplicating notes.
* **Protected Code Anchors:** `src/main.ts` -> `runAnkiSync`, `src/sync/anki-bridge.ts` -> `pushCardToAnkiConnect`

### [TRAP: Leech-Card-Runaway-Loop]
* **Strict Rule:** Cards with `lapses >= 5` or `>= 2` Confident Misconceptions (`:CF`) in their last 5 reviews are flagged via `isLeechCard` and surfaced in the Study Queue "Leech Cards" filter and Card Browser badge.
* **Protected Code Anchor:** `src/core/fsrs-adapter.ts` -> `isLeechCard`

### [DECISION: Non-Blocking-Startup-Hydration] | Aliases: startup latency, non-blocking onload, deferred settings
> **1-Line Summary:** Hydrated settings asynchronously via settingsReady and gated onLayoutReady card index rebuild on settingsReady so onload() is non-blocking.
* **Decision Maker:** `[DECIDED BY: HUMAN]`
* **Protected Code Anchors (Grep Targets):** `src/main.ts` -> `onload`, `settingsReady`

