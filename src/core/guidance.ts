import {
  conditionsMatch
} from "./delegationEngine";

import type {
  BoundaryRule,
  DecisionFacts,
  DelegationRevision,
  DelegationWorkspace,
  FactorDefinition
} from "./types";

export type ApplyToolState =
  | "idle"
  | "registering"
  | "available"
  | "failed";

export type GuidanceMode =
  | "HUMAN"
  | "CHATGPT"
  | "RECOVERY"
  | "COMPLETE";

export type GuidanceStateId =
  | "S01_SCOPE_WORK"
  | "S02_CHECKING_WEBMCP"
  | "S03_WEBMCP_NOT_DETECTED"
  | "S04_WEBMCP_DEGRADED"
  | "S05_INITIAL_AGENT_HANDOFF"
  | "S06_FRESH_CHALLENGE_HANDOFF"
  | "S07_HUMAN_CHALLENGE"
  | "S08_CONTINUE_TO_REVIEW"
  | "S09_REVIEW_NEEDS_CHALLENGE"
  | "S10_REVIEW_HAS_OPEN_CHALLENGE"
  | "S11_INVARIANT_VERIFICATION_INCOMPLETE"
  | "S12_BLOCKED_WITH_OPEN_CHALLENGE"
  | "S13_BLOCKED_GUARDRAIL"
  | "S14_BLOCKED_REGRESSION"
  | "S15_BLOCKED_BOTH"
  | "S16_READY_FOR_HUMAN_APPROVAL"
  | "S17_APPLY_TOOL_REGISTERING"
  | "S18_APPROVED_DIRECT_APPLY"
  | "S19_APPLY_TOOL_FAILED"
  | "S20_APPLIED_COMPLETE"
  | "S21_INVALID_CURRENT_STATE"
  | "S22_AGENT_TOOL_ERROR";

export const GUIDANCE_STATE_COUNT = 22;

export interface GuidanceInput {
  workspace: DelegationWorkspace;
  baseToolCount: number;
  baseToolsResolved: boolean;
  applyToolState: ApplyToolState;
  lastAgentError?: string | null;
}

export interface GuidanceState {
  id: GuidanceStateId;
  key: string;
  mode: GuidanceMode;
  owner: string;
  action: string;
  detail: string;

  /**
   * Exact destination for the next action.
   * Browser actions use:
   *   Section number · Section name → control / object
   * ChatGPT handoffs use:
   *   ChatGPT Desktop → current conversation
   */
  where: string;

  /**
   * Human / recovery states can expose one contextual
   * in-page navigation button. ChatGPT handoffs do not.
   */
  goLabel?: string;

  prompt?: string;
  returnWhen?: string;
  targetId: string;
}

export const INITIAL_CHATGPT_PROMPT =
  "Help me determine a safe delegation boundary for the work already defined in this workspace. Use the available site tools and continue until human judgment is required.";

export const CONTINUE_CHATGPT_PROMPT =
  "Continue from the current workspace.";

export function approvedApplyChatGPTPrompt(
  revisionVersion: number
) {
  return `Human authorization: Apply the exact currently human-approved revision ${revisionVersion} using the available site tool. Do not modify or substitute the revision. Stop when the workspace shows Applied, or if the approval no longer matches the current revision.`;
}

function currentRevision(
  workspace: DelegationWorkspace
): DelegationRevision {
  const revision =
    workspace.revisions.find(
      (candidate) =>
        candidate.id ===
        workspace.currentRevisionId
    );

  if (!revision) {
    throw new Error(
      "Current revision does not exist."
    );
  }

  return revision;
}

function state(
  value: GuidanceState
): GuidanceState {
  return value;
}

function firstMatchingRule(
  revision: DelegationRevision,
  facts: DecisionFacts,
  factors: FactorDefinition[]
): BoundaryRule | undefined {
  return [...revision.boundary.rules]
    .sort(
      (left, right) =>
        left.priority - right.priority
    )
    .find(
      (rule) =>
        conditionsMatch(
          facts,
          rule.when,
          factors
        )
    );
}

function conflictingBoundaryTarget(
  workspace: DelegationWorkspace,
  revision: DelegationRevision
): {
  where: string;
  targetId: string;
  goLabel: string;
} {
  let facts:
    | DecisionFacts
    | undefined;

  const violatedGuardrail =
    revision.review?.guardrails.find(
      (result) =>
        result.violated &&
        result.witnessFacts
    );

  if (
    violatedGuardrail
      ?.witnessFacts
  ) {
    facts =
      violatedGuardrail
        .witnessFacts;
  }

  if (!facts) {
    const failedRegression =
      revision.review?.regressions.find(
        (result) =>
          !result.passed
      );

    const knownDecision =
      revision.knownDecisions.find(
        (decision) =>
          decision.id ===
          failedRegression
            ?.knownDecisionId
      );

    facts =
      knownDecision?.facts;
  }

  const rule =
    facts
      ? firstMatchingRule(
          revision,
          facts,
          workspace.factors
        )
      : undefined;

  if (rule) {
    return {
      where:
        `01 · Current boundary → ${rule.label}`,
      targetId:
        `boundary-rule-${rule.id}`,
      goLabel:
        "Go to conflicting rule"
    };
  }

  return {
    where:
      "01 · Current boundary → boundary rules",
    targetId:
      "next-boundary",
    goLabel:
      "Go to boundary rules"
  };
}

function regressionRepairPrompt(
  revision: DelegationRevision,
  preserveGuardrails: boolean
): string {
  const failures =
    revision.review?.regressions.filter(
      (result) =>
        !result.passed
    ) ?? [];

  const expectedOutcomes = [
    ...new Set(
      failures.map(
        (result) =>
          result.expectedOutcome
      )
    )
  ];

  const outcomeInstruction =
    failures.length === 1 &&
    expectedOutcomes.length === 1
      ? `the failed scenario remains ${expectedOutcomes[0]}`
      : "each failed scenario retains its recorded outcome";

  const removesAgentAuthority =
    failures.some(
      (result) =>
        result.actualOutcome ===
          "AGENT_ONLY" &&
        result.expectedOutcome !==
          "AGENT_ONLY"
    );

  const authorityInstruction =
    removesAgentAuthority
      ? " If the existing factors cannot safely distinguish the failed scenario, you are authorized to remove the conflicting agent-only rule."
      : " Make the smallest boundary change that preserves the recorded outcome.";

  const guardrailInstruction =
    preserveGuardrails
      ? " Preserve every non-negotiable Guardrail."
      : "";

  return `Human decision: Preserve the recorded Human Decision. Adjust the conflicting boundary so ${outcomeInstruction}.${authorityInstruction}${guardrailInstruction} Continue with the available site tools until the next human judgment is required.`;
}

export function deriveGuidanceState(
  input: GuidanceInput
): GuidanceState {
  const workspace =
    input.workspace;

  const current =
    currentRevision(
      workspace
    );

  const taskConfigured =
    workspace.task.title
      .trim()
      .length > 0;

  if (!taskConfigured) {
    return state({
      id: "S01_SCOPE_WORK",
      key: "scope",
      mode: "HUMAN",
      owner: "NEXT · HUMAN",
      action:
        "Start with this work",
      detail:
        "Define the work before any Agent can change delegation authority.",
      where:
        "01 · Current boundary → Work to delegate",
      goLabel:
        "Go to Work to delegate",
      targetId: "next-task"
    });
  }

  /*
   * Terminal and post-review human actions are owned by the page.
   * WebMCP is optional at this point, so tool registration or a
   * stale Agent error must never hide direct apply or completion.
   */
  if (
    current.status ===
    "SUPERSEDED"
  ) {
    return state({
      id:
        "S21_INVALID_CURRENT_STATE",
      key: "invalid-current",
      mode: "RECOVERY",
      owner: "RECOVERY",
      action: "Start new work",
      detail:
        "A superseded revision cannot be the current workspace state.",
      where:
        "Header → Start new work",
      goLabel:
        "Go to Start new work",
      targetId:
        "next-start-new"
    });
  }

  if (
    current.status ===
    "APPLIED"
  ) {
    return state({
      id:
        "S20_APPLIED_COMPLETE",
      key: "complete",
      mode: "COMPLETE",
      owner: "WORKFLOW COMPLETE",
      action:
        `Revision ${current.version} applied successfully`,
      detail:
        "The exact human-approved boundary is active. No further action is required for this workspace.",
      where:
        "Top → completion report",
      targetId:
        "workflow-complete"
    });
  }

  if (
    current.status ===
    "APPROVED"
  ) {
    if (
      input.applyToolState ===
        "registering" ||
      input.applyToolState ===
        "idle"
    ) {
      return state({
        id:
          "S17_APPLY_TOOL_REGISTERING",
        key:
          "apply-registering",
        mode: "HUMAN",
        owner: "NEXT · HUMAN",
        action:
          `Apply approved revision ${current.version}`,
        detail:
          "Complete directly in this workspace. The optional ChatGPT apply capability is still preparing.",
        where:
          `02 · Review the change → Apply approved revision ${current.version}`,
        goLabel:
          "Go to direct apply",
        targetId:
          "next-apply-direct"
      });
    }

    if (
      input.applyToolState ===
      "failed"
    ) {
      return state({
        id:
          "S19_APPLY_TOOL_FAILED",
        key: "apply-failed",
        mode: "HUMAN",
        owner: "NEXT · HUMAN",
        action:
          `Apply approved revision ${current.version}`,
        detail:
          "Complete directly in this workspace. The optional ChatGPT apply route is unavailable until the page is reloaded.",
        where:
          `02 · Review the change → Apply approved revision ${current.version}`,
        goLabel:
          "Go to direct apply",
        targetId:
          "next-apply-direct"
      });
    }

    return state({
      id:
        "S18_APPROVED_DIRECT_APPLY",
      key: "apply",
      mode: "HUMAN",
      owner:
        "NEXT · HUMAN",
      action:
        `Apply approved revision ${current.version}`,
      detail:
        "Complete directly in this workspace. ChatGPT remains available as an optional WebMCP apply route.",
      where:
        `02 · Review the change → Apply approved revision ${current.version}`,
      goLabel:
        "Go to direct apply",
      targetId:
        "next-apply-direct"
    });
  }

  if (
    current.status ===
    "READY_FOR_DECISION"
  ) {
    return state({
      id:
        "S16_READY_FOR_HUMAN_APPROVAL",
      key: "approve",
      mode: "HUMAN",
      owner: "NEXT · HUMAN",
      action:
        `Approve revision ${current.version}`,
      detail:
        "Checks are complete. Final authority remains with the human.",
      where:
        `02 · Review the change → Approve revision ${current.version}`,
      goLabel:
        "Go to approval",
      targetId: "next-approve"
    });
  }

  if (input.lastAgentError) {
    return state({
      id: "S22_AGENT_TOOL_ERROR",
      key: "agent-error",
      mode: "RECOVERY",
      owner: "RECOVERY",
      action:
        "Retry from the current workspace",
      detail:
        input.lastAgentError,
      where:
        "ChatGPT Desktop → current conversation",
      prompt:
        CONTINUE_CHATGPT_PROMPT,
      returnWhen:
        "Return here after ChatGPT completes the retry or asks for human judgment.",
      targetId: "next-agent"
    });
  }

  /*
   * Registration is asynchronous. A transient zero must never
   * be presented as "WebMCP not detected".
   */
  if (!input.baseToolsResolved) {
    return state({
      id:
        "S02_CHECKING_WEBMCP",
      key: "checking-webmcp",
      mode: "RECOVERY",
      owner: "CHECKING",
      action:
        "Checking WebMCP availability",
      detail:
        "No action is required while this page registers its site tools.",
      where:
        "03 · Revision history → WebMCP",
      goLabel:
        "Go to WebMCP status",
      targetId: "next-agent"
    });
  }

  if (
    input.baseToolCount === 0
  ) {
    return state({
      id:
        "S03_WEBMCP_NOT_DETECTED",
      key: "webmcp-missing",
      mode: "RECOVERY",
      owner: "SETUP REQUIRED",
      action:
        "Open this page in ChatGPT Desktop",
      detail:
        "The Human workspace works here, but Agent handoff requires WebMCP site tools.",
      where:
        "03 · Revision history → WebMCP",
      goLabel:
        "Go to WebMCP status",
      returnWhen:
        "Continue only when this page shows 5 WebMCP tools available.",
      targetId: "next-agent"
    });
  }

  if (
    input.baseToolCount < 5
  ) {
    return state({
      id:
        "S04_WEBMCP_DEGRADED",
      key: "webmcp-degraded",
      mode: "RECOVERY",
      owner: "RECOVERY",
      action:
        "Reload before using the Agent",
      detail:
        `Only ${input.baseToolCount} of 5 normal WebMCP tools registered. Do not start Agent work in a partial tool state.`,
      where:
        "03 · Revision history → WebMCP",
      goLabel:
        "Go to WebMCP status",
      returnWhen:
        "Continue only when all 5 normal tools are available.",
      targetId: "next-agent"
    });
  }

  const openChallenges =
    current.challenges.filter(
      (challenge) =>
        challenge.status ===
        "OPEN"
    );

  const guardrailViolations =
    current.review
      ?.guardrails
      .filter(
        (result) =>
          result.violated
      )
      .length ?? 0;

  const regressions =
    current.review
      ?.regressions
      .filter(
        (result) =>
          !result.passed
      )
      .length ?? 0;

  if (
    current.status ===
    "BLOCKED"
  ) {
    if (
      openChallenges.length > 0
    ) {
      return state({
        id:
          "S12_BLOCKED_WITH_OPEN_CHALLENGE",
        key:
          "blocked-open-challenge",
        mode: "HUMAN",
        owner: "NEXT · HUMAN",
        action:
          "Resolve the open Agent Challenge first",
        detail:
          "The revision is blocked and still contains an unresolved question for human judgment.",
        where:
          "02 · Review the change → Agent Challenges",
        goLabel:
          "Go to Agent Challenge",
        targetId:
          "next-challenge"
      });
    }

    const conflict =
      conflictingBoundaryTarget(
        workspace,
        current
      );

    if (
      guardrailViolations > 0 &&
      regressions > 0
    ) {
      return state({
        id:
          "S15_BLOCKED_BOTH",
        key: "blocked-both",
        mode: "HUMAN",
        owner: "NEXT · HUMAN",
        action:
          "Adjust the conflicting boundary rule",
        detail:
          "The current boundary conflicts with both a non-negotiable Guardrail and a prior Human Decision.",
        where: conflict.where,
        prompt:
          regressionRepairPrompt(
            current,
            true
          ),
        returnWhen:
          "Return here when ChatGPT asks for the next Human Decision.",
        goLabel:
          conflict.goLabel,
        targetId:
          conflict.targetId
      });
    }

    if (
      guardrailViolations > 0
    ) {
      return state({
        id:
          "S13_BLOCKED_GUARDRAIL",
        key:
          "blocked-guardrail",
        mode: "HUMAN",
        owner: "NEXT · HUMAN",
        action:
          "Adjust the conflicting boundary rule",
        detail:
          "The current boundary violates a non-negotiable Guardrail.",
        where: conflict.where,
        goLabel:
          conflict.goLabel,
        targetId:
          conflict.targetId
      });
    }

    if (regressions > 0) {
      return state({
        id:
          "S14_BLOCKED_REGRESSION",
        key:
          "blocked-regression",
        mode: "HUMAN",
        owner: "NEXT · HUMAN",
        action:
          "Adjust the conflicting boundary rule",
        detail:
          "The current boundary conflicts with a Human Decision preserved from an earlier challenge.",
        where: conflict.where,
        prompt:
          regressionRepairPrompt(
            current,
            false
          ),
        returnWhen:
          "Return here when ChatGPT asks for the next Human Decision.",
        goLabel:
          conflict.goLabel,
        targetId:
          conflict.targetId
      });
    }

    return state({
      id:
        "S21_INVALID_CURRENT_STATE",
      key: "invalid-current",
      mode: "RECOVERY",
      owner: "RECOVERY",
      action: "Start new work",
      detail:
        "The revision is Blocked without a recorded Guardrail violation or regression.",
      where:
        "Header → Start new work",
      goLabel:
        "Go to Start new work",
      targetId:
        "next-start-new"
    });
  }

  if (
    current.status ===
    "NEEDS_REVIEW"
  ) {
    if (
      current.review &&
      !current.review
        .guardrailVerificationComplete
    ) {
      return state({
        id:
          "S11_INVARIANT_VERIFICATION_INCOMPLETE",
        key:
          "verification-incomplete",
        mode: "RECOVERY",
        owner:
          "REVIEW REQUIRED",
        action:
          "This revision cannot be approved",
        detail:
          "The Guardrail invariant check could not cover the complete decision domain. A partial check is never treated as approval-ready.",
        where:
          "02 · Review the change → Guardrails",
        goLabel:
          "Go to Guardrails",
        targetId:
          "next-guardrails"
      });
    }

    if (
      openChallenges.length > 0
    ) {
      return state({
        id:
          "S10_REVIEW_HAS_OPEN_CHALLENGE",
        key:
          "review-open-challenge",
        mode: "HUMAN",
        owner: "NEXT · HUMAN",
        action:
          "Resolve the open Agent Challenge",
        detail:
          "Review cannot complete while a Challenge still requires human judgment.",
        where:
          "02 · Review the change → Agent Challenges",
        goLabel:
          "Go to Agent Challenge",
        targetId:
          "next-challenge"
      });
    }

    if (
      current.challenges.length === 0
    ) {
      return state({
        id:
          "S09_REVIEW_NEEDS_CHALLENGE",
        key:
          "review-needs-challenge",
        mode: "CHATGPT",
        owner:
          "NEXT · CHATGPT",
        action:
          "Challenge this exact revision",
        detail:
          "A revision with zero Agent Challenges cannot become approval-ready.",
        where:
          "ChatGPT Desktop → current conversation",
        prompt:
          CONTINUE_CHATGPT_PROMPT,
        returnWhen:
          "Return here when a Human Decision appears.",
        targetId: "next-agent"
      });
    }

    return state({
      id:
        "S21_INVALID_CURRENT_STATE",
      key: "invalid-current",
      mode: "RECOVERY",
      owner: "RECOVERY",
      action: "Start new work",
      detail:
        "The review state does not map to a valid next action.",
      where:
        "Header → Start new work",
      goLabel:
        "Go to Start new work",
      targetId:
        "next-start-new"
    });
  }

  if (
    current.status === "DRAFT"
  ) {
    if (
      openChallenges.length > 0
    ) {
      return state({
        id:
          "S07_HUMAN_CHALLENGE",
        key: "decision",
        mode: "HUMAN",
        owner: "NEXT · HUMAN",
        action:
          "Choose one Human Decision outcome",
        detail:
          "Allow agent-only · Keep human review · Do not delegate",
        where:
          "02 · Review the change → Agent Challenges",
        goLabel:
          "Go to Agent Challenge",
        targetId:
          "next-challenge"
      });
    }

    if (
      current.challenges.length > 0
    ) {
      return state({
        id:
          "S08_CONTINUE_TO_REVIEW",
        key:
          "continue-review",
        mode: "CHATGPT",
        owner:
          "NEXT · CHATGPT",
        action:
          "Continue the review",
        detail:
          "Human judgment is recorded. Let ChatGPT re-read and review the current revision.",
        where:
          "ChatGPT Desktop → current conversation",
        prompt:
          CONTINUE_CHATGPT_PROMPT,
        returnWhen:
          "Return here when the workspace becomes Blocked, Ready for decision, or asks for another Human Decision.",
        targetId: "next-agent"
      });
    }

    if (
      current.version === 1
    ) {
      return state({
        id:
          "S05_INITIAL_AGENT_HANDOFF",
        key: "initial-agent",
        mode: "CHATGPT",
        owner:
          "NEXT · CHATGPT",
        action:
          "Continue with the Agent",
        detail:
          "The work is scoped. ChatGPT can now inspect the boundary, propose a revision, and challenge it.",
        where:
          "ChatGPT Desktop → current conversation",
        prompt:
          INITIAL_CHATGPT_PROMPT,
        returnWhen:
          "Return here when a Human Decision appears.",
        targetId: "next-agent"
      });
    }

    return state({
      id:
        "S06_FRESH_CHALLENGE_HANDOFF",
      key: "fresh-challenge",
      mode: "CHATGPT",
      owner:
        "NEXT · CHATGPT",
      action:
        "Re-test the revised boundary",
      detail:
        "The boundary changed, so earlier Agent Challenges are stale. ChatGPT must challenge this exact revision again.",
      where:
        "ChatGPT Desktop → current conversation",
      prompt:
        CONTINUE_CHATGPT_PROMPT,
      returnWhen:
        "Return here when a new Human Decision appears.",
      targetId: "next-agent"
    });
  }

  return state({
    id:
      "S21_INVALID_CURRENT_STATE",
    key: "invalid-current",
    mode: "RECOVERY",
    owner: "RECOVERY",
    action: "Start new work",
    detail:
      `No safe next action is defined for revision status ${current.status}.`,
    where:
      "Header → Start new work",
    goLabel:
      "Go to Start new work",
    targetId:
      "next-start-new"
  });
}
