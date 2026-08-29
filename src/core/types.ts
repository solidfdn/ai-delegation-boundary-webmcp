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

/* ==========================================================
   AI Delegation Boundary
   Core domain model

   The legacy Decision Patch demo types above remain intact
   while the Challenge product moves to this generic model.
   ========================================================== */

export type DelegationOutcome =
  | "AGENT_ONLY"
  | "HUMAN_REVIEW"
  | "DO_NOT_DELEGATE";

export type FactorValue =
  | string
  | number
  | boolean;

export type DecisionFacts = Record<
  string,
  FactorValue | null
>;

export type FactorType =
  | "BOOLEAN"
  | "ORDERED"
  | "NUMBER"
  | "CATEGORY";

export interface FactorDefinition {
  id: string;
  label: string;
  description?: string;
  type: FactorType;

  /**
   * Required when type === ORDERED.
   * Values are ordered from least to greatest.
   */
  orderedValues?: string[];

  /**
   * Optional allowed values for CATEGORY.
   */
  categories?: string[];

  unit?: string;
}

export type ConditionOperator =
  | "EQ"
  | "NEQ"
  | "AT_LEAST"
  | "AT_MOST"
  | "IN"
  | "NOT_IN"
  | "IS_SET";

export interface DecisionCondition {
  factorId: string;
  operator: ConditionOperator;
  value?: FactorValue | FactorValue[];
}

export interface BoundaryRule {
  id: string;
  label: string;

  /**
   * Lower values are evaluated first.
   */
  priority: number;

  when: DecisionCondition[];
  outcome: DelegationOutcome;
  rationale?: string;
}

export interface DelegationBoundary {
  id: string;
  label: string;
  rules: BoundaryRule[];
  defaultOutcome: DelegationOutcome;
}

export interface Guardrail {
  id: string;
  label: string;
  description: string;
  when: DecisionCondition[];

  /**
   * A guardrail can require Human Review or forbid
   * delegation completely. It can never force AGENT_ONLY.
   */
  requiredOutcome:
    | "HUMAN_REVIEW"
    | "DO_NOT_DELEGATE";
}

export interface KnownDecision {
  id: string;
  label: string;
  facts: DecisionFacts;
  expectedOutcome: DelegationOutcome;
  rationale: string;
  createdInRevisionId: string;
}

export type ChallengeStatus =
  | "OPEN"
  | "RESOLVED";

export type ChallengeResolution =
  | "KEEP_HUMAN"
  | "ALLOW_AGENT"
  | "DO_NOT_DELEGATE"
  | "CHANGE_BOUNDARY"
  | "NOT_APPLICABLE";

export interface AgentChallenge {
  id: string;
  title: string;

  /**
   * A hypothetical or boundary scenario proposed by
   * the agent to challenge the current revision.
   */
  scenario: DecisionFacts;

  whyItMatters: string;
  suggestedOutcome?: DelegationOutcome;

  status: ChallengeStatus;

  humanResolution?: {
    decision: ChallengeResolution;
    note: string;
  };
}

export interface GuardrailCheckResult {
  guardrailId: string;

  /**
   * Least restrictive outcome found anywhere in the
   * exhaustively verified finite decision domain.
   */
  actualOutcome: DelegationOutcome;

  requiredOutcome:
    | "HUMAN_REVIEW"
    | "DO_NOT_DELEGATE";

  violated: boolean;

  /**
   * Concrete counterexample for the least-restrictive
   * outcome found. This is a deterministic witness,
   * not synthetic ground truth.
   */
  witnessFacts?: DecisionFacts;
}

export interface RegressionCheckResult {
  knownDecisionId: string;
  expectedOutcome: DelegationOutcome;
  actualOutcome: DelegationOutcome;
  passed: boolean;
}

export interface RevisionReview {
  guardrails: GuardrailCheckResult[];

  /**
   * Guardrails are verified as invariants across the
   * complete finite decision domain.
   *
   * If the domain cannot be verified exhaustively,
   * the revision cannot become READY_FOR_DECISION.
   */
  guardrailVerificationComplete: boolean;
  guardrailStatesChecked: number;
  guardrailsChecked: number;

  regressions: RegressionCheckResult[];

  /**
   * A revision must be actively challenged before it can
   * become READY_FOR_DECISION.
   *
   * Zero challenges is not evidence of safety.
   */
  challengeCount: number;
  challengeSatisfied: boolean;

  unresolvedChallengeIds: string[];
  reviewedAt: string;
}

export type RevisionStatus =
  | "DRAFT"
  | "NEEDS_REVIEW"
  | "BLOCKED"
  | "READY_FOR_DECISION"
  | "APPROVED"
  | "APPLIED"
  | "SUPERSEDED";

export type RevisionActor =
  | "HUMAN"
  | "AGENT"
  | "SYSTEM";

export interface DelegationRevision {
  id: string;
  version: number;
  parentRevisionId: string | null;

  createdBy: RevisionActor;
  createdAt: string;
  changeSummary: string;

  boundary: DelegationBoundary;
  guardrails: Guardrail[];
  knownDecisions: KnownDecision[];
  challenges: AgentChallenge[];

  review?: RevisionReview;
  status: RevisionStatus;
}

export interface DelegationTask {
  title: string;
  description?: string;
}

export interface RevisionApproval {
  revisionId: string;

  /**
   * SHA-256 fingerprint of the exact reviewable state
   * approved by the human.
   */
  fingerprint: string;

  approvedAt: string;
  approvedBy: "HUMAN";
}

export interface RevisionApplication {
  revisionId: string;
  fingerprint: string;
  appliedAt: string;
}

export interface DelegationWorkspace {
  id: string;
  task: DelegationTask;

  factors: FactorDefinition[];

  revisions: DelegationRevision[];
  currentRevisionId: string;

  /**
   * Approval always refers to one exact revision fingerprint.
   * Any new revision invalidates current approval.
   */
  approval?: RevisionApproval;

  /**
   * Historical record of the last applied revision.
   */
  application?: RevisionApplication;
}
