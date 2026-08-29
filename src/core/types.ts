export type Decision = "APPROVE" | "HUMAN_REVIEW" | "DECLINE";

export interface DecisionCase {
  id: string;
  caseType: string;
  urgency: "LOW" | "MEDIUM" | "HIGH";
  evidenceStrength: "WEAK" | "PARTIAL" | "STRONG";
  potentialHarm: "LOW" | "MEDIUM" | "HIGH";
  vulnerability: "LOW" | "MEDIUM" | "HIGH";
  continuityImpact: "LOW" | "MEDIUM" | "HIGH";
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
