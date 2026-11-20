# Architectural Decisions, Pivots & Landmines (`DECISIONS_AND_TRAPS.md`)
> **1-Line Summary:** Architectural pivots and scheduler landmines for Practice Engine.

## 1. Architectural Decisions & Pivot History

### [DECISION: Dual-Algorithm-Support-FSRS-And-SM2] | Aliases: scheduler pivot, modern spaced repetition
> **1-Line Summary:** Transitioned from basic SM-2 to configurable FSRS algorithm with SM-2 legacy fallback.
* **Decision Maker:** `[DECIDED BY: AGENT - Approved by Human]`
* **Plain-English Summary of Pivot:** FSRS models memory retention significantly better than vintage 1980s SM-2, avoiding "ease hell".

## 2. Do-Not-Touch Engineering Landmines (Traps)

### [TRAP: Zero-Interval-Infinite-Review-Loop] | Aliases: scheduling stall, new card starvation
> **1-Line Summary:** A returned interval of `0` causes cards to immediately reappear in the active queue continuously.
* **Strict Rule:** **NEVER** allow the scheduler to return a repetition interval less than 1 day for passed cards.
* **Protected Code Anchors (Grep Targets):**
  * `src/scheduler.ts` -> `MINIMUM_INTERVAL_GUARD`
