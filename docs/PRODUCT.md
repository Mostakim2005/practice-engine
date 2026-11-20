# Product Intent & Feature Map (`PRODUCT.md`)
> **1-Line Summary:** Topic-based active recall and spaced repetition engine with two-stage metacognitive review and FSRS / SM-2 algorithms.

## 1. Core Vision & User Experience Intent
* **What This App Does (Plain English):** Transforms notes into active recall flashcards with a metacognitive review step (predicting recall confidence before flipping) and spaced repetition scheduling.
* **How It Must Feel to Use:** Fluid, distraction-free, keyboard-navigable card reviews with zero latency.

## 2. Active Features (Do Not Break)

### [FEATURE: Two-Stage-Metacognitive-Review] | Aliases: confidence rating, flashcard review, active recall
> **1-Line Summary:** Prompts user for a pre-reveal metacognitive confidence rating before displaying the answer.
* **Code Anchors (Grep Targets):**
  * `src/main.ts` -> `renderReviewModal`, `handleMetacognitiveRating`

### [FEATURE: FSRS-Spaced-Repetition-Scheduler] | Aliases: fsrs algorithm, sm2 interval, card scheduler
> **1-Line Summary:** Calculates optimum retention intervals using modern FSRS stability and difficulty equations.
* **Code Anchors (Grep Targets):**
  * `src/scheduler.ts` -> `calculateNextReviewInterval`

## 3. Planned Features & App-Merge Wishlist

### [WISHLIST: Anki-APKG-BiDirectional-Sync] | Aliases: anki sync, apkg export
> **1-Line Summary:** Two-way sync with desktop Anki collections without data corruption.
