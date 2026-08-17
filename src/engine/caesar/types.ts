export type Difficulty = 1 | 2 | 3 | 4 | 5;

export type Correctness = "correct" | "incorrect" | "partial" | "unanswered";

export type LearningPhase =
  | "acquisition"
  | "stabilization"
  | "discrimination"
  | "transfer"
  | "maintenance";

export type LearningObjective =
  | "encode"
  | "retrieve"
  | "stabilize"
  | "repair-memory"
  | "repair-concept"
  | "repair-procedure"
  | "discriminate"
  | "elaborate"
  | "switch-representation"
  | "transfer"
  | "calibrate"
  | "maintain"
  | "explore";

export type LearningIntervention =
  | "retrieval"
  | "guided-retrieval"
  | "worked-example"
  | "completion-problem"
  | "independent-problem"
  | "conceptual-explanation"
  | "self-explanation"
  | "comparison"
  | "contrast"
  | "representation-switch"
  | "diagnosis"
  | "transfer"
  | "maintenance";

export type ErrorType =
  | "forgetting"
  | "misconception"
  | "prerequisite-gap"
  | "method-selection"
  | "procedure-execution"
  | "calculation"
  | "unit-error"
  | "interpretation"
  | "representation"
  | "attention-slip"
  | "guess"
  | "unknown";

export type RepresentationType =
  | "verbal"
  | "symbolic"
  | "numerical"
  | "diagram"
  | "graph"
  | "equation"
  | "data"
  | "physical-scenario"
  | "code"
  | "mixed"
  | "unknown";

export type PracticeMode =
  | "practice"
  | "random"
  | "weak-areas"
  | "mixed"
  | "exam"
  | "adaptive"
  | "viva";

export type CandidateSource =
  | "due-review"
  | "weak-concept"
  | "previously-wrong"
  | "error-repair"
  | "prerequisite"
  | "transfer"
  | "contrast"
  | "new-learning"
  | "maintenance";

export interface QuestionDescriptor {
  id: string;
  version?: number;
  subject?: string;
  topic?: string;
  subtopic?: string;
  conceptIds: string[];
  difficulty: Difficulty;
  cognitiveLevel?: string;
  questionFamily: string;
  type: string;
  representationType?: RepresentationType;
  verified?: boolean;
  prerequisites?: string[];
  contrastsWith?: string[];
  relatedConceptIds?: string[];
  importance?: number;
  supportedInterventions?: LearningIntervention[];
  estimatedTimeMs?: number;
}

export interface AttemptEvent {
  id: string;
  questionId: string;
  questionVersion?: number;
  sessionId: string;
  timestamp: number;

  response?: unknown;
  correctness: Correctness;
  score?: number;

  confidence?: 1 | 2 | 3 | 4 | 5;
  responseTimeMs?: number;
  timeToFirstActionMs?: number;

  hintsUsed: number;
  highestHintLevel?: number;
  answerRevealed: boolean;

  errorType?: ErrorType;

  conceptIds: string[];
  questionType: string;
  questionFamily: string;
  cognitiveLevel?: string;
  difficulty: Difficulty;
  representationType?: RepresentationType;

  schemaVersion: number;
}

export interface MemoryState {
  stability: number;
  difficulty: number;
  retrievability: number;
  lastReviewAt?: number;
  reviewCount: number;
  successCount: number;
  failureCount: number;
  learningStep: number;
  modelId: string;
  modelVersion: string;
}

export interface MasteryState {
  conceptual: number | null;
  procedural: number | null;
  transfer: number | null;
  evidenceCount: number;
  lastEvidenceAt?: number;
}

export interface MetacognitiveState {
  attemptsWithConfidence: number;
  meanConfidence?: number;
  calibrationScore?: number;
  correctHighConfidence: number;
  correctLowConfidence: number;
  incorrectHighConfidence: number;
  incorrectLowConfidence: number;
}

export interface ErrorState {
  counts: Partial<Record<ErrorType, number>>;
  lastErrorType?: ErrorType;
  lastErrorAt?: number;
  misconceptionActive: boolean;
  misconceptionEvidenceCount: number;
  prerequisiteGapEvidenceCount: number;
}

export interface QuestionLearningState {
  questionId: string;
  attemptCount: number;
  lastAttemptAt?: number;
  lastResult?: Correctness;
  lastConfidence?: 1 | 2 | 3 | 4 | 5;
  lastResponseTimeMs?: number;
  totalCorrect: number;
  totalIncorrect: number;
  totalPartial: number;
  hintsUsedTotal: number;
  memory: MemoryState;
  errors: ErrorState;
  recentAttemptIds: string[];
}

export interface KnowledgeComponentState {
  conceptId: string;
  memory: MemoryState;
  mastery: MasteryState;
  metacognition: MetacognitiveState;
  errors: ErrorState;
  practiceCount: number;
  lastPracticedAt?: number;
  lastSuccessfulPracticeAt?: number;
  lastFailedPracticeAt?: number;
  relatedQuestionIds: string[];
}

export interface CognitiveSessionState {
  sessionId: string;
  startedAt: number;
  attemptCount: number;
  recentQuestionIds: string[];
  recentConceptIds: string[];
  recentDifficulty: number[];
  recentResponseTimesMs: number[];
  recentHintLevels: number[];
  fatigueEstimate?: number;
  mode: PracticeMode;
}

export interface PersonalizationState {
  learnerId: string;
  evidenceCount: number;

  difficultyBias: number;
  guidanceDependence: number;
  confidenceCalibrationGap: number;

  personalWeight: number;
}

export interface CAESARLearnerState {
  learnerId: string;
  schemaVersion: number;
  questionStates: Record<string, QuestionLearningState>;
  conceptStates: Record<string, KnowledgeComponentState>;
  sessions: Record<string, CognitiveSessionState>;
  personalization?: PersonalizationState;
  recentAttemptIds: string[];
  updatedAt: number;
}


export interface RetrievalOutcome {
  result: Correctness;
  score?: number;
  confidence?: number;
  responseTimeMs?: number;
  hintsUsed: number;
  highestHintLevel?: number;
  answerRevealed: boolean;
  elapsedSincePreviousReviewMs?: number;
}

export interface MemoryRecommendation {
  retrievability: number;
  memoryNeed: number;
  recommendedIntervalMs: number;
  dueAt: number;
  targetRetrievability: number;
  modelId: string;
  modelVersion: string;
}

export interface CandidateFeatures {
  memoryNeed: number;
  conceptWeakness: number;
  proceduralWeakness: number;
  transferNeed: number;
  errorRepair: number;
  calibrationNeed: number;
  prerequisiteNeed: number;
  contrastValue: number;
  representationNovelty: number;
  familyNovelty: number;
  difficultyFit: number;
  importance: number;
  explorationValue: number;

  repetitionCost: number;
  loadRisk: number;
  fatigueCost: number;
  disruptionCost: number;

  effectiveDifficulty: number;
  expectedTimeMs: number;
}

export interface CandidateScore extends CandidateFeatures {
  objectiveFit: number;
  interventionFit: number;
  totalUtility: number;
}

export interface LearningDecision {
  decisionId: string;
  questionId: string;
  phase: LearningPhase;
  objective: LearningObjective;
  intervention: LearningIntervention;
  score: CandidateScore;
  reason: string;
  confidence: number;
  caesarVersion: string;
  policyVersion: string;
  memoryModelVersion: string;
}

export interface LearningDecisionContext {
  learnerState: CAESARLearnerState;
  availableQuestions: QuestionDescriptor[];
  session: CognitiveSessionState;
  now: number;
  mode: PracticeMode;
  userGoal?:
    | "learn-new"
    | "retain"
    | "understand"
    | "problem-solving"
    | "transfer"
    | "exam-prep"
    | "maintenance"
    | "weak-areas"
    | "mixed";
  timeBudgetMs?: number;
}
