export type AnkiSyncMode = "none" | "anki-connect" | "obsidian-to-anki" | "fsrs4anki-export";
export type CardFormat = "callout" | "block";

export interface VisibleColumns {
  topic: boolean;
  type: boolean;
  difficulty: boolean;
  interval: boolean;
  reps: boolean;
  due: boolean;
}

export interface PracticeSettings {
  practiceFolder: string;
  targetRetention: number;
  cardFormat: CardFormat;
  ankiSyncMode: AnkiSyncMode;
  ankiConnectUrl: string;
  ankiDefaultDeck: string;
  ankiNoteType: string;
  enableObsidianSRCompat: boolean;
  enableLatexToolboxBridge: boolean;
  previewLines: string;
  visibleColumns: VisibleColumns;
  lastTopicPath: string;
  glassmorphism: boolean;
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
  fileBasename: string;
  format: CardFormat;
  startLine: number;
  endLine: number;
  metaLine: number;
  type: string;
  difficulty: string;
  subjects: string[];
  concepts: string[];
  questionMd: string;
  answerMd: string;
  deck: string;
  tags: string[];
  meta: CardMeta;
}

export interface CardDraftInput {
  type: string;
  difficulty: string;
  subjects: string[];
  tags: string[];
  concepts: string[];
  question: string;
  answer: string;
}

export interface AnkiSyncResult {
  synced: number;
  failed: number;
  total: number;
  errors: string[];
}

export const COGNITIVE_TYPES = [
  "Conceptual",
  "Calculation",
  "Deep Thinking",
  "Factual",
  "Procedural",
] as const;

export const DIFFICULTY_LEVELS = [
  "Introductory",
  "Moderate",
  "Challenging",
  "Mastery",
] as const;

export interface MetacognitiveChoice {
  id: string;
  code: string;
  label: string;
  hint: string;
  css: string;
}

export const RETRIEVAL_EFFORTS: readonly MetacognitiveChoice[] = [
  { id: "FAST_CONFIDENT", code: "FC", label: "Instant Recall", hint: "Immediate, effortless memory retrieval", css: "pe-effort-fast" },
  { id: "DELIBERATE", code: "DS", label: "Deliberate Search", hint: "Active reasoning or step-by-step recall", css: "pe-effort-deliberate" },
  { id: "MENTAL_CALC", code: "MC", label: "Mental Math", hint: "Solved mentally without scratchpad", css: "pe-effort-mental" },
  { id: "TOOL_CALC", code: "TC", label: "Scratchpad / Calc", hint: "Required paper derivation or calculator", css: "pe-effort-tool" },
  { id: "EDUCATED_GUESS", code: "EG", label: "Educated Guess", hint: "Uncertain hunch or partial elimination", css: "pe-effort-guess" },
  { id: "BLANK", code: "BL", label: "Complete Blank", hint: "Could not recall or initiate solution", css: "pe-effort-blank" },
];

export const ACCURACY_DIAGNOSTICS: readonly MetacognitiveChoice[] = [
  { id: "FLAWLESS", code: "FL", label: "Flawless & Complete", hint: "Exact answer and sound reasoning", css: "pe-acc-flawless" },
  { id: "FACTUAL_SLIP", code: "FS", label: "Factual / Calc Slip", hint: "Right method, minor sign or arithmetic error", css: "pe-acc-slip" },
  { id: "PARTIAL_CONCEPTS", code: "PC", label: "Partial Concepts", hint: "Missed key edge case or sub-concept", css: "pe-acc-partial" },
  { id: "CONFIDENT_FLAW", code: "CF", label: "Confident Misconception", hint: "Felt sure, but core mental model was wrong", css: "pe-acc-confident-flaw" },
  { id: "TOTAL_FAILURE", code: "TF", label: "Total Failure", hint: "Incorrect or blank answer", css: "pe-acc-fail" },
];
