export type AnkiSyncMode = "none" | "anki-connect" | "obsidian-to-anki" | "fsrs4anki-export";

export interface VisibleColumns {
  topic: boolean;
  subject: boolean;
  type: boolean;
  difficulty: boolean;
  interval: boolean;
  reps: boolean;
  due: boolean;
}

export interface PracticeSettings {
  practiceFolder: string;
  attachmentFolder: string;
  schedulerMode: "fsrs" | "sm2";
  targetRetention: number;
  cardFormat: "callout" | "block";
  creationMode: "modal" | "direct";
  ankiSyncMode: AnkiSyncMode;
  ankiConnectUrl: string;
  ankiDefaultDeck: string;
  ankiNoteType: string;
  enableObsidianSRCompat: boolean;
  enableLatexToolboxBridge: boolean;
  enableNoteToolboxBridge: boolean;
  enableNaturalMathEngine: boolean;
  enableSmartMathTyping: boolean;
  previewLines: string;
  visibleColumns: VisibleColumns;
  lastTopicPath: string;
  glassmorphism: boolean;
  cardDraft: Record<string, unknown> | null;
}

export interface CardMeta {
  id: string;
  due: string;
  ivl: number;
  reps: number;
  diff: number;
  s: number;
  d: number;
  lapses: number;
  attempts: number;
  hist: string[];
  ankiNoteId?: number;
}

export interface IndexedCard {
  key: string;
  filePath: string;
  startLine: number;
  endLine: number;
  metaLine: number;
  questionMd: string;
  answerMd: string;
  deck: string;
  tags: string[];
  meta: CardMeta;
}
