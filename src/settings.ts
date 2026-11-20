import type { PracticeSettings } from "./types";

export const DEFAULT_SETTINGS: PracticeSettings = {
  practiceFolder: "Practice",
  attachmentFolder: "attachments",
  schedulerMode: "fsrs",
  targetRetention: 0.90,
  cardFormat: "callout",
  creationMode: "modal",
  ankiSyncMode: "none",
  ankiConnectUrl: "http://127.0.0.1:8765",
  ankiDefaultDeck: "Practice Engine",
  ankiNoteType: "PracticeEngine-2Stage",
  enableObsidianSRCompat: true,
  enableLatexToolboxBridge: true,
  enableNoteToolboxBridge: false,
  enableNaturalMathEngine: true,
  enableSmartMathTyping: true,
  previewLines: "2",
  visibleColumns: { topic: true, subject: true, type: true, difficulty: true, interval: true, reps: true, due: true },
  lastTopicPath: "",
  glassmorphism: true,
  cardDraft: null,
};
