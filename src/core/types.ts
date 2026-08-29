export type Decision = "APPROVE" | "HUMAN_REVIEW" | "DECLINE";
export type Level = "LOW" | "MEDIUM" | "HIGH";
export type EvidenceLevel = "WEAK" | "PARTIAL" | "STRONG";

export interface DecisionCase {
  id: string;
  caseType: string;
  urgency: Level;
  evidenceStrength: EvidenceLevel;
  potentialHarm: Level;
  vulnerability: Level;
  continuityImpact: Level;
}

export interface HumanCorrection {
  decision: Decision;
  rationale: string;
  useAsPrecedent: boolean;
}

export interface WorkspaceState {
  observedCase: DecisionCase;
  agentDecision: Decision;
  humanCorrection: HumanCorrection;
  precedentRecorded: boolean;
}

export interface PatchConditions {
  urgencyAtLeast?: Level;
  evidenceAtLeast?: EvidenceLevel;
  vulnerabilityAtLeast?: Level;
  potentialHarmAtMost?: Level;
  continuityAtLeast?: Level;
}

export interface DecisionPatch {
  id: string;
  scope: "NARROW" | "BALANCED" | "BROAD";
  conditions: PatchConditions;
  outcome: Decision;
}

export interface EvaluationCase extends DecisionCase {
  baselineDecision: Decision;
  referenceDecision: Decision;
}

export interface PatchSimulation {
  patchId: string;
  total: number;
  changed: number;
  aligned: number;
  counterexamples: number;
  reviewsTransitioned: number;
  affectedCaseIds: string[];
  counterexampleCases: EvaluationCase[];
}
