export type CognitiveType = 'recall' | 'conceptual' | 'procedural' | 'calculation';

export type RetrievalEffort = 
    | 'FAST_CONFIDENT'   // Immediate recall with high confidence
    | 'EFFORTFUL'        // Recalled after deliberate struggle
    | 'EDUCATED_GUESS'   // Uncertain / weak intuition
    | 'BLANK';           // Complete retrieval failure

export type ConceptualAccuracy = 
    | 'FLAWLESS'         // Correct mechanics and concepts
    | 'FACTUAL_SLIP'     // Understood concept, minor math/detail slip
    | 'PARTIAL_CONCEPTS' // Some concepts right, others missed
    | 'CONCEPTUAL_FLAW'  // Fundamental misconception (severe penalty if confident)
    | 'TOTAL_FAILURE';   // Completely incorrect

export interface CardMetadata {
    due: string;         // YYYY-MM-DD
    interval: number;    // Days
    reps: number;
    difficulty: number;  // 1.0 (Easy) to 5.0 (Hard)
    history: string[];   // ["2026-10-12:FC:FL"]
}

export interface PracticeCard {
    id: string;
    filePath: string;
    topic: string;
    sourceLecture?: string;
    lineStart: number;
    lineEnd: number;
    type: CognitiveType;
    concepts: string[];
    questionRaw: string;
    answerRaw: string;
    metadata: CardMetadata;
}