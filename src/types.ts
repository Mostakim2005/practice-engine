// Practice Engine — faithful types from live Nihon 2.1.0 bundle (4021 lines)
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
  enableLatexToolboxBridge: boolean;
  enableNoteToolboxBridge: boolean;
  enableNaturalMathEngine: boolean;
  enableSmartMathTyping: boolean;
  previewLines: string;
  visibleColumns: VisibleColumns;
  lastTopicPath: string;
  glassmorphism: boolean;
  cardDraft: null;
}
