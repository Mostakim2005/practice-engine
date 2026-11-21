# Practice Engine

Topic-based active recall and spaced repetition for Obsidian with a two-stage metacognitive review workstation, official [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) scheduling, interactive card browser, activity heatmap analytics, and multi-mode Anki sync.

Current version: `v3.0.0`.

## Features

- **Ribbon Menu & 4-Tab Workstation**: Click the **brain** ribbon icon to open Study Queue, Card Browser, Analytics & Heatmap, and Sync & Tools; click **+** to add a question immediately.
- **Two-Stage Metacognitive Review**: Rate retrieval effort (Stage 1) before revealing the answer and grading actual accuracy (Stage 2), with keyboard navigation (`1-6`, `Space/Enter`, `T`, `→`, `Esc`) and interactive cloze/masking-tape peeling.
- **Official `ts-fsrs` Scheduling**: Full `State.Review` / `State.Relearning` reconstruction, leech detection, and `<!--SR:!due,ivl,ease-->` compatibility.
- **Dual Card Syntax**: Supports both Obsidian Callouts (`> [!question]` / `> > [!answer]`) and clean Markdown blocks (`%%pe-card ... %%` / `%%pe-answer%%` / `%%pe-end%%`).
- **Multi-Mode Anki Bridge**: Direct AnkiConnect push (auto-creating decks and `PracticeEngine-2Stage` model, writing back `ankiId`), `Obsidian_to_Anki` block export, and `FSRS4Anki` JSON review log export.

## Develop

- `npm ci` (Node 20+)
- `npm run dev` (watch mode)
- `npm run build` -> compiles `main.js`

Manual install: copy `main.js`, `manifest.json`, and `styles.css` to `<Vault>/.obsidian/plugins/practice-engine/`.

## License

Code: PolyForm Noncommercial 1.0.0 (see `LICENSE`). Docs: CC BY-NC 4.0. Copyright (c) Mostakim2005. Source-available: free non-commercial use with credit, no commercial use.