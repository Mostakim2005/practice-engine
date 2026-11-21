# Visual Feature & Change Log (`VISUAL_LOG.md`)
> **1-Line Summary:** Flowcharts explaining Practice Engine flashcard review lifecycle and multi-mode Anki synchronization.

## Feature & Change Flowcharts

### [VISUAL: Metacognitive-Review-And-FSRS-Lifecycle] | Aliases: review session flow, card grading, fsrs lifecycle
> **1-Line Summary:** End-to-end flow from vault card indexing to metacognitive evaluation and FSRS interval scheduling.

```mermaid
flowchart TD
    %% Color Definitions (Obsidian & GitHub compatible)
    classDef startNode fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff
    classDef processNode fill:#0f766e,stroke:#115e59,color:#ffffff
    classDef decisionNode fill:#b45309,stroke:#78350f,color:#ffffff
    classDef outputNode fill:#15803d,stroke:#14532d,color:#ffffff

    Start([Start: Study Session]):::startNode --> Query[Query Due Cards from In-Memory Index]:::processNode
    Query --> Front[Present Card Question / Front]:::processNode
    Front --> Stage1[Stage 1: User Predicts Metacognitive Confidence 1-4]:::processNode
    Stage1 --> Flip[Reveal Card Answer / Back]:::processNode
    Flip --> Stage2[Stage 2: User Verifies Actual Accuracy]:::processNode
    Stage2 --> FSRS[ts-fsrs: Compute Stability, Difficulty & Interval]:::processNode
    FSRS --> LeechCheck{Lapses >= 5?}:::decisionNode
    LeechCheck -->|Yes| FlagLeech[Mark Card as Leech]:::decisionNode
    LeechCheck -->|No| NextCard[Advance to Next Card]:::processNode
    FlagLeech --> Persist[(Write <!--pe-meta--> Comment to Note)]:::outputNode
    NextCard --> Persist

    subgraph Legend["Legend (Color Guide)"]
        L1([Blue = Session Entry]):::startNode
        L2[Teal = Metacognitive Review & FSRS Processing]:::processNode
        L3{Orange = Branching / Leech Evaluation}:::decisionNode
        L4[(Green = Persistent Note Storage)]:::outputNode
    end
```

> **Plain-English Explanation:** When a user initiates a study session, due cards are retrieved from memory. Before revealing the answer, the user rates their predicted confidence (Stage 1). After viewing the answer, accuracy is confirmed (Stage 2). The `ts-fsrs` adapter calculates the card's new stability and review date, flags potential leeches, and persists the scheduling metadata into the note.

---

### [VISUAL: Multi-Mode-Anki-Bridge-Pipeline] | Aliases: anki sync pipeline, export workflow
> **1-Line Summary:** Data flow across AnkiConnect local REST calls, clipboard exports, and optimizer logging.

```mermaid
flowchart LR
    %% Color Definitions (Obsidian & GitHub compatible)
    classDef startNode fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff
    classDef routerNode fill:#7c3aed,stroke:#5b21b6,color:#ffffff
    classDef actionNode fill:#0f766e,stroke:#115e59,color:#ffffff
    classDef targetNode fill:#15803d,stroke:#14532d,color:#ffffff

    Cards([Indexed Vault Flashcards]):::startNode --> Dispatch{Anki Sync Mode}:::routerNode

    Dispatch -->|anki-connect| Push[HTTP POST :8765 /addNote]:::actionNode
    Dispatch -->|obsidian-to-anki| Format[Format TARGET DECK Block]:::actionNode
    Dispatch -->|fsrs4anki-export| JSON[Assemble FSRS4Anki JSON History]:::actionNode

    Push --> AnkiApp[(Desktop Anki Collection)]:::targetNode
    Format --> Clip1[(Clipboard -> Obsidian_to_Anki)]:::targetNode
    JSON --> Clip2[(Clipboard -> FSRS4Anki Optimizer)]:::targetNode

    subgraph Legend["Legend (Color Guide)"]
        L1([Blue = Source Flashcards]):::startNode
        L2{Purple = Mode Dispatcher}:::routerNode
        L3[Teal = Formatting & Transmission Actions]:::actionNode
        L4[(Green = Destination Apps & Clipboard)]:::targetNode
    end
```

> **Plain-English Explanation:** The user selects their preferred synchronization backend in settings. When triggered, cards are dispatched either directly to desktop Anki via HTTP port 8765, formatted as text blocks for the `Obsidian_to_Anki` plugin, or compiled into standard JSON review logs for parameter optimization in `fsrs4anki`.
