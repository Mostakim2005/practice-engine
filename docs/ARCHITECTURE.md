# System Architecture (`ARCHITECTURE.md`)
> **1-Line Summary:** Modular TypeScript spaced repetition engine embedded in Obsidian.

## 1. High-Level Visual System Map

```mermaid
flowchart TB
    %% Color Definitions (Obsidian & GitHub compatible)
    classDef startNode fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff
    classDef processNode fill:#0f766e,stroke:#115e59,color:#ffffff
    classDef outputNode fill:#15803d,stroke:#14532d,color:#ffffff

    Deck([Vault Flashcards / Note Headings]):::startNode --> Parser[Card Extractor & Parser]:::processNode
    Parser --> ReviewModal[Two-Stage Metacognitive Modal]:::processNode
    ReviewModal -->|User grades retention| Scheduler[FSRS / SM-2 Algorithmic Scheduler]:::processNode
    Scheduler -->|Updates card stability & next due date| Database[(Local data.json Card Store)]:::outputNode

    subgraph Legend["Legend (Color Guide)"]
        L1([Blue = Source Cards / Notes]):::startNode
        L2[Teal = Review & Scheduler Processing]:::processNode
        L3[(Green = Updated Card State Store)]:::outputNode
    end
```

## 2. Tech Stack & Why We Chose It

| Layer | Tool / Library | Plain-English Reason Why |
| --- | --- | --- |
| Host / UI | Obsidian Plugin API | Native modal and view rendering. |
| Algorithms | Custom TypeScript FSRS/SM-2 | Zero external dependencies for scheduling math. |
| Bundler | esbuild | High-speed single file packaging. |

## 3. Core Subsystems & Engineering Tricks

### [SUBSYSTEM: Metacognitive-Card-Scheduler] | Aliases: fsrs scheduler, retention calculator
> **1-Line Summary:** Computes next review intervals based on difficulty, stability, and retrievability.
* **Code Anchors (Grep Targets):**
  * `src/scheduler.ts` -> `nextInterval`

## 4. Recipes: How to Add New Things Safely
* **To add a new flashcard syntax parser:**
  1. Register pattern regex in `src/main.ts` -> `CARD_SYNTAX_PATTERNS`.
