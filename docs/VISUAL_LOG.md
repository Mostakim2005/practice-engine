# Visual Feature & Change Log (`VISUAL_LOG.md`)
> **1-Line Summary:** Flowcharts explaining Practice Engine flashcard review lifecycle.

## Feature & Change Flowcharts

### [VISUAL: Active-Recall-Review-Cycle] | Aliases: review session flow, card grading
> **1-Line Summary:** Complete lifecycle of a flashcard from queue extraction to post-review scheduling.

```mermaid
flowchart TD
    %% Color Definitions (Obsidian & GitHub compatible)
    classDef startNode fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff
    classDef processNode fill:#0f766e,stroke:#115e59,color:#ffffff
    classDef outputNode fill:#15803d,stroke:#14532d,color:#ffffff

    Start([Start: Review Session]):::startNode --> Queue[Fetch Due Cards from Index]:::processNode
    Queue --> Prompt[Display Front of Card]:::processNode
    Prompt --> Meta[User Rates Confidence Level 1-4]:::processNode
    Meta --> Reveal[Reveal Back of Card]:::processNode
    Reveal --> Result[Calculate FSRS Interval]:::processNode
    Result --> Store([Update Card Due Date in Vault]):::outputNode

    subgraph Legend["Legend (Color Guide)"]
        L1([Blue = Session Entry]):::startNode
        L2[Teal = Metacognitive & Scheduling Steps]:::processNode
        L3([Green = Saved Outcome]):::outputNode
    end
```
