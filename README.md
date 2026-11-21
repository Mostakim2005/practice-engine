# Practice Engine

Two-stage metacognitive flashcard review workstation powered by FSRS spaced repetition, Markdown AST card indexing, and Anki bridge sync.

## UI/UX Surface Inventory

| Surface | Implementation |
| :--- | :--- |
| **Ribbon Icons** | Brain icon (`Open Practice Engine Workstation`) and Plus icon (`Add Practice Question`). |
| **Workspace View** | `PracticeView` (`ItemView`) for active recall review sessions. |
| **Modals** | `QuestionEditorModal` and `DeleteConfirmModal`. |
| **Status Bar** | Clickable `Practice: Workstation` pill launching the review workstation. |
| **Context Menu** | `editor-menu` entry to quickly add a practice question while reading a note. |
| **Settings Tab** | `PracticeEngineSettingTab`. |

## Documentation

- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS_AND_TRAPS.md`
- `docs/VISUAL_LOG.md`
- `AGENTS.md`

## Develop

```bash
npm install
npm run build
```

## License

See `LICENSE`.
