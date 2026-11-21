# Architectural Decisions, Pivots & Landmines (`DECISIONS_AND_TRAPS.md`)
> **1-Line Summary:** Architectural pivots, library decisions, and non-obvious engineering landmines for Practice Engine.

## 1. Architectural Decisions & Pivot History

### [DECISION: Official-TsFsrs-Adoption-And-Modular-Architecture] | Aliases: ts-fsrs adoption, modular port, architecture pivot
> **1-Line Summary:** Replaced vintage SM-2 math and custom prototype scheduler with the official `ts-fsrs` npm package and modular TypeScript subsystems.
* **Decision Maker:** `[DECIDED BY: AGENT - Approved by Human]`
* **Plain-English Summary of Pivot:** Maintaining a custom implementation of modern FSRS math introduces calculation edge cases. Leveraging `ts-fsrs` provides industry-standard stability/difficulty updates and seamless export to the `fsrs4anki` optimizer.

### [DECISION: Purge-Legacy-Runtime-Bundle] | Aliases: runtime purge, monolith removal
> **1-Line Summary:** Completely eliminated the 5,600+ line monolithic `runtime/` folder in favor of pure compilation from `src/`.
* **Decision Maker:** `[DECIDED BY: AGENT - Approved by Human]`
* **Plain-English Summary of Pivot:** Shipping a duplicate compiled JavaScript runtime alongside source files created confusion, merge conflicts, and maintenance debt during audit passes. Building directly via `esbuild` guarantees source-truth fidelity.

## 2. Do-Not-Touch Engineering Landmines (Traps)

### [TRAP: AnkiConnect-Offline-Failures] | Aliases: ankiconnect timeout, sync stall
> **1-Line Summary:** If desktop Anki is closed or AnkiConnect plugin is disabled, sync requests will fail.
* **Strict Rule:** **ALWAYS** wrap AnkiConnect calls in defensive `try/catch` blocks inside loop processing so a single connection error alerts the user without aborting remaining operations or corrupting local vault files.
* **Protected Code Anchors (Grep Targets):**
  * `src/main.ts` -> `runAnkiSync`
  * `src/sync/anki-bridge.ts` -> `invokeAnkiConnect`

### [TRAP: AST-Line-Offset-Drift-On-Save] | Aliases: line drift, file rewrite collision
> **1-Line Summary:** Modifying card metadata lines directly in notes can shift line offsets of subsequent cards in the same file.
* **Strict Rule:** Card update operations must re-index the file or use content-addressed unique IDs (`<!--pe-meta:{"id":...}-->`) rather than relying on cached line numbers.
* **Protected Code Anchors (Grep Targets):**
  * `src/core/card-index.ts` -> `reindexFile`
  * `src/core/markdown-ast.ts` -> `extractCardsFromMarkdown`

### [TRAP: Leech-Card-Runaway-Loop] | Aliases: leech stall, lapse runaway
> **1-Line Summary:** Cards repeatedly failed cause lapse counts to escalate indefinitely and clutter daily reviews.
* **Strict Rule:** Any card whose lapse count reaches or exceeds `MAX_LAPSES` (default 5) must be flagged as a leech via `isLeechCard` to prompt restructuring.
* **Protected Code Anchors (Grep Targets):**
  * `src/core/fsrs-adapter.ts` -> `isLeechCard`
