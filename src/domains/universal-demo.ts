import type { WorkspaceState } from "../core/types";

export const initialWorkspace: WorkspaceState = {
  observedCase: {
    id: "CASE-001",
    caseType: "Critical support request",
    urgency: "HIGH",
    evidenceStrength: "PARTIAL",
    potentialHarm: "MEDIUM",
    vulnerability: "HIGH",
    continuityImpact: "HIGH"
  },
  agentDecision: "HUMAN_REVIEW",
  humanCorrection: {
    decision: "APPROVE",
    rationale:
      "Urgency and vulnerability are high, and sufficient supporting evidence is available for this decision.",
    useAsPrecedent: true
  },
  precedentRecorded: false
};
