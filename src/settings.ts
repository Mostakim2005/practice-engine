import type { PracticeSettings } from "./types";
export const DEFAULT_SETTINGS: PracticeSettings = {
  practiceFolder: "Practice",
  attachmentFolder: "attachments",
  schedulerMode: "fsrs",
  targetRetention: 0.90,
  cardFormat: "callout",
  creationMode: "modal",
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
