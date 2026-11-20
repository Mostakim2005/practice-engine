# Project Operating Instructions (`AGENTS.md`)
> **Notice:** This project inherits user persona, confirmation gates, visual standards, and documentation blueprints from the global master `AGENTS.md`. Do not duplicate those rules here.

## 1. Project Tech Stack & Environment
* **Runtime / Language:** Node.js v20+, TypeScript 5+, esbuild
* **Framework / Host:** Obsidian Plugin API (`obsidian`)
* **Target OS / Build Output:** Desktop & Mobile (`runtime/main.js`, `runtime/manifest.json`, `runtime/styles.css`)

## 2. Mandatory Verification & Build Commands
* **Type Check:** `npx tsc --noEmit`
* **Build / Package:** `npm run build`

## 3. Repository Directory Structure & Conventions
* `src/` - Modular source files (`main.ts`, `scheduler.ts`, `settings.ts`, `types.ts`).
* `runtime/` - Compiled plug-and-play deliverable files for vault deployment.
* `docs/` - Core Markdown documentation suite (`PRODUCT.md`, `ARCHITECTURE.md`, `DECISIONS_AND_TRAPS.md`, `VISUAL_LOG.md`).

## 4. Critical Trap Pointers (1-Line Warnings Only)
* **TRAP 1:** Never clamp repetition interval to zero in the FSRS scheduler — see `docs/DECISIONS_AND_TRAPS.md` -> `[TRAP: Zero-Interval-Infinite-Review-Loop]`.
* **TRAP 2:** Never parse cards without verifying note YAML metadata boundaries — see `docs/DECISIONS_AND_TRAPS.md` -> `[TRAP: Vault-Note-Parsing-Collisions]`.
