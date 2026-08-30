import type {
  DelegationRevision,
  DelegationWorkspace
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
  | "S18_APPROVED_AGENT_HANDOFF"
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
  where?: string;
  prompt?: string;
  returnWhen?: string;
  targetId: string;
}

export const INITIAL_CHATGPT_PROMPT =
  "Help me determine a safe delegation boundary for the work defined in this page. Use this page's available tools and continue until human judgment is required.";

export const CONTINUE_CHATGPT_PROMPT =
  "Continue from the current workspace.";

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

export function deriveGuidanceState(
  input: GuidanceInput
): GuidanceState {
  const workspace = input.workspace;
  const current =
    currentRevision(workspace);

  const taskConfigured =
    workspace.task.title
      .trim()
      .length > 0;

  /*
   * Human task scope comes first even when WebMCP is not
   * available yet. The browser remains usable without an Agent.
   */
  if (!taskConfigured) {
    return state({
      id: "S01_SCOPE_WORK",
      key: "scope",
      mode: "HUMAN",
      owner: "NEXT · HUMAN",
      action: "Start with this work",
      detail:
        "Define the work before any Agent can change delegation authority.",
      where: "This page",
      targetId: "next-task"
    });
  }

  /*
   * A tool error is recoverable. The browser state remains
   * authoritative and must not be reset because an Agent call failed.
   */
  if (input.lastAgentError) {
    return state({
      id: "S22_AGENT_TOOL_ERROR",
      key: "agent-error",
      mode: "RECOVERY",
      owner: "RECOVERY",
      action: "Retry from the current workspace",
      detail:
        input.lastAgentError,
      where: "ChatGPT desktop app",
      prompt: CONTINUE_CHATGPT_PROMPT,
      returnWhen:
        "Return here after ChatGPT completes the retry or asks for human judgment.",
      targetId: "next-agent"
    });
  }

  /*
   * Registration is asynchronous. Do not mislabel the transient
   * initial zero as "WebMCP not detected".
   */
  if (!input.baseToolsResolved) {
    return state({
      id: "S02_CHECKING_WEBMCP",
      key: "checking-webmcp",
      mode: "RECOVERY",
      owner: "CHECKING",
      action: "Checking WebMCP availability",
      detail:
        "No action is required while this page registers its site tools.",
      where: "This page",
      targetId: "next-agent"
    });
  }

  if (input.baseToolCount === 0) {
    return state({
      id: "S03_WEBMCP_NOT_DETECTED",
      key: "webmcp-missing",
      mode: "RECOVERY",
      owner: "SETUP",
      action: "Open this page in ChatGPT Desktop",
      detail:
        "The Human workspace works here, but Agent handoff requires WebMCP site tools.",
      where:
        "ChatGPT desktop app · built-in browser",
      returnWhen:
        "Return when this page shows 5 WebMCP tools available.",
      targetId: "next-agent"
    });
  }

  if (input.baseToolCount < 5) {
    return state({
      id: "S04_WEBMCP_DEGRADED",
      key: "webmcp-degraded",
      mode: "RECOVERY",
      owner: "RECOVERY",
      action: "Reload before using the Agent",
      detail:
        `Only ${input.baseToolCount} of 5 normal WebMCP tools registered. Do not start Agent work in a partial tool state.`,
      where: "This page",
      returnWhen:
        "Continue only when all 5 normal tools are available.",
      targetId: "next-agent"
    });
  }

  if (current.status === "SUPERSEDED") {
    return state({
      id: "S21_INVALID_CURRENT_STATE",
      key: "invalid-current",
      mode: "RECOVERY",
      owner: "RECOVERY",
      action: "Start new work",
      detail:
        "A superseded revision cannot be the current workspace state.",
      where: "This page",
      targetId: "next-start-new"
    });
  }

  if (current.status === "APPLIED") {
    return state({
      id: "S20_APPLIED_COMPLETE",
      key: "complete",
      mode: "COMPLETE",
      owner: "COMPLETE",
      action:
        `Revision ${current.version} applied`,
      detail:
        "The exact human-approved delegation state is now the applied state for this workspace.",
      where: "This page",
      targetId: "next-complete"
    });
  }

  if (current.status === "APPROVED") {
    if (
      input.applyToolState ===
        "registering" ||
      input.applyToolState === "idle"
    ) {
      return state({
        id: "S17_APPLY_TOOL_REGISTERING",
        key: "apply-registering",
        mode: "RECOVERY",
        owner: "CHECKING",
        action:
          "Preparing the approved apply capability",
        detail:
          "Human approval is complete. The page is registering the additional WebMCP capability.",
        where: "This page",
        targetId: "next-agent"
      });
    }

    if (
      input.applyToolState === "failed"
    ) {
      return state({
        id: "S19_APPLY_TOOL_FAILED",
        key: "apply-failed",
        mode: "RECOVERY",
        owner: "RECOVERY",
        action:
          "Reload before applying the approved revision",
        detail:
          "Human approval is preserved, but the additional apply capability did not register.",
        where: "This page",
        returnWhen:
          "Continue only when the WebMCP card shows 6 tools.",
        targetId: "next-agent"
      });
    }

    return state({
      id: "S18_APPROVED_AGENT_HANDOFF",
      key: "apply",
      mode: "CHATGPT",
      owner: "NEXT · CHATGPT",
      action:
        "Apply the human-approved revision",
      detail:
        "Human approval unlocked one additional WebMCP capability. No tool name needs to be typed.",
      where: "ChatGPT desktop app",
      prompt: CONTINUE_CHATGPT_PROMPT,
      returnWhen:
        "Return here when the workspace shows Applied.",
      targetId: "next-agent"
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
      where: "This page",
      targetId: "next-approve"
    });
  }

  const openChallenges =
    current.challenges.filter(
      (challenge) =>
        challenge.status === "OPEN"
    );

  const guardrailViolations =
    current.review?.guardrails.filter(
      (result) => result.violated
    ).length ?? 0;

  const regressions =
    current.review?.regressions.filter(
      (result) => !result.passed
    ).length ?? 0;

  if (current.status === "BLOCKED") {
    if (openChallenges.length > 0) {
      return state({
        id:
          "S12_BLOCKED_WITH_OPEN_CHALLENGE",
        key: "blocked-open-challenge",
        mode: "HUMAN",
        owner: "NEXT · HUMAN",
        action:
          "Resolve the open Agent Challenge first",
        detail:
          "The revision is blocked and still contains an unresolved question for human judgment.",
        where: "This page",
        targetId: "next-challenge"
      });
    }

    if (
      guardrailViolations > 0 &&
      regressions > 0
    ) {
      return state({
        id: "S15_BLOCKED_BOTH",
        key: "blocked-both",
        mode: "HUMAN",
        owner: "NEXT · HUMAN",
        action:
          "Adjust the highlighted boundary",
        detail:
          "The current boundary conflicts with both a non-negotiable Guardrail and a prior Human Decision.",
        where: "This page",
        targetId: "next-boundary"
      });
    }

    if (guardrailViolations > 0) {
      return state({
        id: "S13_BLOCKED_GUARDRAIL",
        key: "blocked-guardrail",
        mode: "HUMAN",
        owner: "NEXT · HUMAN",
        action:
          "Adjust the highlighted boundary",
        detail:
          "The current boundary violates a non-negotiable Guardrail.",
        where: "This page",
        targetId: "next-boundary"
      });
    }

    if (regressions > 0) {
      return state({
        id: "S14_BLOCKED_REGRESSION",
        key: "blocked-regression",
        mode: "HUMAN",
        owner: "NEXT · HUMAN",
        action:
          "Adjust the highlighted boundary",
        detail:
          "The current boundary conflicts with a Human Decision preserved from an earlier challenge.",
        where: "This page",
        targetId: "next-boundary"
      });
    }

    return state({
      id: "S21_INVALID_CURRENT_STATE",
      key: "invalid-current",
      mode: "RECOVERY",
      owner: "RECOVERY",
      action: "Start new work",
      detail:
        "The revision is Blocked without a recorded Guardrail violation or regression.",
      where: "This page",
      targetId: "next-start-new"
    });
  }

  if (
    current.status === "NEEDS_REVIEW"
  ) {
    if (
      current.review &&
      !current.review
        .guardrailVerificationComplete
    ) {
      return state({
        id:
          "S11_INVARIANT_VERIFICATION_INCOMPLETE",
        key: "verification-incomplete",
        mode: "RECOVERY",
        owner: "REVIEW REQUIRED",
        action:
          "This revision cannot be approved",
        detail:
          "The Guardrail invariant check could not cover the complete decision domain. The product must not treat a partial check as approval-ready.",
        where: "This page",
        targetId: "next-review"
      });
    }

    if (openChallenges.length > 0) {
      return state({
        id:
          "S10_REVIEW_HAS_OPEN_CHALLENGE",
        key: "review-open-challenge",
        mode: "HUMAN",
        owner: "NEXT · HUMAN",
        action:
          "Resolve the open Agent Challenge",
        detail:
          "Review cannot complete while a Challenge still requires human judgment.",
        where: "This page",
        targetId: "next-challenge"
      });
    }

    if (
      current.challenges.length === 0
    ) {
      return state({
        id:
          "S09_REVIEW_NEEDS_CHALLENGE",
        key: "review-needs-challenge",
        mode: "CHATGPT",
        owner: "NEXT · CHATGPT",
        action:
          "Challenge this exact revision",
        detail:
          "A revision with zero Agent Challenges cannot become approval-ready.",
        where: "ChatGPT desktop app",
        prompt: CONTINUE_CHATGPT_PROMPT,
        returnWhen:
          "Return here when a Human Decision appears.",
        targetId: "next-agent"
      });
    }

    return state({
      id: "S21_INVALID_CURRENT_STATE",
      key: "invalid-current",
      mode: "RECOVERY",
      owner: "RECOVERY",
      action: "Start new work",
      detail:
        "The review state does not map to a valid next action.",
      where: "This page",
      targetId: "next-start-new"
    });
  }

  if (current.status === "DRAFT") {
    if (openChallenges.length > 0) {
      return state({
        id: "S07_HUMAN_CHALLENGE",
        key: "decision",
        mode: "HUMAN",
        owner: "NEXT · HUMAN",
        action:
          "Choose one Human Decision outcome",
        detail:
          "Allow agent-only · Keep human review · Do not delegate",
        where: "This page",
        targetId: "next-challenge"
      });
    }

    if (
      current.challenges.length > 0
    ) {
      return state({
        id: "S08_CONTINUE_TO_REVIEW",
        key: "continue-review",
        mode: "CHATGPT",
        owner: "NEXT · CHATGPT",
        action:
          "Continue the review",
        detail:
          "Human judgment is recorded. Let ChatGPT re-read and review the current revision.",
        where: "ChatGPT desktop app",
        prompt: CONTINUE_CHATGPT_PROMPT,
        returnWhen:
          "Return here when the workspace becomes Blocked, Ready for decision, or asks for another Human Decision.",
        targetId: "next-agent"
      });
    }

    if (current.version === 1) {
      return state({
        id:
          "S05_INITIAL_AGENT_HANDOFF",
        key: "initial-agent",
        mode: "CHATGPT",
        owner: "NEXT · CHATGPT",
        action:
          "Continue with the Agent",
        detail:
          "The work is scoped. ChatGPT can now inspect the boundary, propose a revision, and challenge it.",
        where: "ChatGPT desktop app",
        prompt: INITIAL_CHATGPT_PROMPT,
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
      owner: "NEXT · CHATGPT",
      action:
        "Re-test the revised boundary",
      detail:
        "The boundary changed, so earlier Agent Challenges are stale. ChatGPT must challenge this exact revision again.",
      where: "ChatGPT desktop app",
      prompt: CONTINUE_CHATGPT_PROMPT,
      returnWhen:
        "Return here when a new Human Decision appears.",
      targetId: "next-agent"
    });
  }

  return state({
    id: "S21_INVALID_CURRENT_STATE",
    key: "invalid-current",
    mode: "RECOVERY",
    owner: "RECOVERY",
    action: "Start new work",
    detail:
      `No safe next action is defined for revision status ${current.status}.`,
    where: "This page",
    targetId: "next-start-new"
  });
}
