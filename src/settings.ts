import type { PracticeSettings } from "./types";

export const DEFAULT_SETTINGS: PracticeSettings = {
  practiceFolder: "Practice",
  targetRetention: 0.90,
  cardFormat: "callout",
  ankiSyncMode: "none",
  ankiConnectUrl: "http://127.0.0.1:8765",
  ankiDefaultDeck: "Practice Engine",
  ankiNoteType: "PracticeEngine-2Stage",
  enableObsidianSRCompat: true,
  enableLatexToolboxBridge: true,
  previewLines: "2",
  visibleColumns: {
    topic: true,
    type: true,
    difficulty: true,
    interval: true,
    reps: true,
    due: true,
  },
  lastTopicPath: "",
  glassmorphism: true,
};
