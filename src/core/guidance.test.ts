import {
  describe,
  expect,
  it
} from "vitest";

import {
  createInteractiveDelegationWorkspace
} from "../domains/interactive-delegation-workspace";

import type {
  AgentChallenge,
  DelegationWorkspace,
  RevisionReview
} from "./types";

import {
  approvedApplyChatGPTPrompt,
  deriveGuidanceState,
  GUIDANCE_STATE_COUNT,
  type ApplyToolState,
  type GuidanceStateId
} from "./guidance";

function workspace() {
  const value =
    createInteractiveDelegationWorkspace();

  value.task = {
    title:
      "Customer refund decisions"
  };

  return value;
}

function current(
  value: DelegationWorkspace
) {
  const revision =
    value.revisions.find(
      (candidate) =>
        candidate.id ===
        value.currentRevisionId
    );

  if (!revision) {
    throw new Error(
      "Current revision missing in test."
    );
  }

  return revision;
}

function challenge(
  status:
    | "OPEN"
    | "RESOLVED"
): AgentChallenge {
  return {
    id: "challenge-test",
    title: "Test challenge",
    scenario: {
      evidence_quality: "HIGH",
      impact: "LOW",
      reversibility: "REVERSIBLE",
      policy_clarity: "CLEAR",
      exceptionality: "STANDARD"
    },
    whyItMatters:
      "Tests the current boundary.",
    status,
    humanResolution:
      status === "RESOLVED"
        ? {
            decision:
              "KEEP_HUMAN",
            note:
              "Human decided."
          }
        : undefined
  };
}

function addKnownRegressionCase(
  value: DelegationWorkspace
) {
  current(value)
    .knownDecisions.push({
      id: "known-test",
      label:
        "Human decision test",
      facts: {
        evidence_quality: "HIGH",
        impact: "LOW",
        reversibility:
          "REVERSIBLE",
        policy_clarity: "CLEAR",
        exceptionality:
          "STANDARD"
      },
      expectedOutcome:
        "HUMAN_REVIEW",
      rationale:
        "Human kept review.",
      createdInRevisionId:
        value.currentRevisionId
    });
}

function review(
  options: {
    complete?: boolean;
    guardrailViolation?: boolean;
    regression?: boolean;
    challengeCount?: number;
    unresolved?: string[];
  } = {}
): RevisionReview {
  const complete =
    options.complete ?? true;

  const guardrailViolation =
    options
      .guardrailViolation ??
    false;

  const regression =
    options.regression ??
    false;

  const challengeCount =
    options.challengeCount ??
    1;

  const unresolved =
    options.unresolved ?? [];

  return {
    guardrails:
      guardrailViolation
        ? [
            {
              guardrailId:
                "guardrail-test",
              actualOutcome:
                "AGENT_ONLY",
              requiredOutcome:
                "HUMAN_REVIEW",
              violated: true,
              witnessFacts: {
                evidence_quality:
                  "HIGH",
                impact: "LOW",
                reversibility:
                  "REVERSIBLE",
                policy_clarity:
                  "CLEAR",
                exceptionality:
                  "STANDARD"
              }
            }
          ]
        : [],

    guardrailVerificationComplete:
      complete,

    guardrailStatesChecked:
      complete ? 1 : 0,

    guardrailsChecked:
      guardrailViolation
        ? 1
        : 0,

    regressions:
      regression
        ? [
            {
              knownDecisionId:
                "known-test",
              expectedOutcome:
                "HUMAN_REVIEW",
              actualOutcome:
                "AGENT_ONLY",
              passed: false
            }
          ]
        : [],

    challengeCount,

    challengeSatisfied:
      challengeCount > 0 &&
      unresolved.length === 0,

    unresolvedChallengeIds:
      unresolved,

    reviewedAt:
      "2026-08-30T00:00:00.000Z"
  };
}

interface InputOverrides {
  baseToolCount?: number;
  baseToolsResolved?: boolean;
  applyToolState?: ApplyToolState;
  lastAgentError?:
    | string
    | null;
}

function derive(
  value: DelegationWorkspace,
  overrides:
    InputOverrides = {}
) {
  return deriveGuidanceState({
    workspace: value,
    baseToolCount:
      overrides.baseToolCount ??
      5,

    baseToolsResolved:
      overrides
        .baseToolsResolved ??
      true,

    applyToolState:
      overrides.applyToolState ??
      "idle",

    lastAgentError:
      overrides.lastAgentError
  });
}

type Case = {
  id: GuidanceStateId;
  expectedWhere: string;
  expectedGoLabel?:
    string;

  build: () => {
    workspace:
      DelegationWorkspace;
    overrides?:
      InputOverrides;
  };
};

const conflictWhere =
  "01 · Current boundary → Delegate low-risk standard decisions";

const cases: Case[] = [
  {
    id: "S01_SCOPE_WORK",
    expectedWhere:
      "01 · Current boundary → Work to delegate",
    expectedGoLabel:
      "Go to Work to delegate",
    build: () => ({
      workspace:
        createInteractiveDelegationWorkspace()
    })
  },
  {
    id:
      "S02_CHECKING_WEBMCP",
    expectedWhere:
      "03 · Revision history → WebMCP",
    expectedGoLabel:
      "Go to WebMCP status",
    build: () => ({
      workspace: workspace(),
      overrides: {
        baseToolsResolved:
          false
      }
    })
  },
  {
    id:
      "S03_WEBMCP_NOT_DETECTED",
    expectedWhere:
      "03 · Revision history → WebMCP",
    expectedGoLabel:
      "Go to WebMCP status",
    build: () => ({
      workspace: workspace(),
      overrides: {
        baseToolCount: 0
      }
    })
  },
  {
    id:
      "S04_WEBMCP_DEGRADED",
    expectedWhere:
      "03 · Revision history → WebMCP",
    expectedGoLabel:
      "Go to WebMCP status",
    build: () => ({
      workspace: workspace(),
      overrides: {
        baseToolCount: 3
      }
    })
  },
  {
    id:
      "S05_INITIAL_AGENT_HANDOFF",
    expectedWhere:
      "ChatGPT Desktop → current conversation",
    build: () => ({
      workspace: workspace()
    })
  },
  {
    id:
      "S06_FRESH_CHALLENGE_HANDOFF",
    expectedWhere:
      "ChatGPT Desktop → current conversation",
    build: () => {
      const value =
        workspace();

      const revision =
        current(value);

      revision.id =
        "delegation-demo-r2";

      revision.version = 2;

      value.currentRevisionId =
        revision.id;

      return {
        workspace: value
      };
    }
  },
  {
    id:
      "S07_HUMAN_CHALLENGE",
    expectedWhere:
      "02 · Review the change → Agent Challenges",
    expectedGoLabel:
      "Go to Agent Challenge",
    build: () => {
      const value =
        workspace();

      current(value)
        .challenges = [
          challenge("OPEN")
        ];

      return {
        workspace: value
      };
    }
  },
  {
    id:
      "S08_CONTINUE_TO_REVIEW",
    expectedWhere:
      "ChatGPT Desktop → current conversation",
    build: () => {
      const value =
        workspace();

      current(value)
        .challenges = [
          challenge(
            "RESOLVED"
          )
        ];

      return {
        workspace: value
      };
    }
  },
  {
    id:
      "S09_REVIEW_NEEDS_CHALLENGE",
    expectedWhere:
      "ChatGPT Desktop → current conversation",
    build: () => {
      const value =
        workspace();

      const revision =
        current(value);

      revision.status =
        "NEEDS_REVIEW";

      revision.review =
        review({
          challengeCount: 0
        });

      return {
        workspace: value
      };
    }
  },
  {
    id:
      "S10_REVIEW_HAS_OPEN_CHALLENGE",
    expectedWhere:
      "02 · Review the change → Agent Challenges",
    expectedGoLabel:
      "Go to Agent Challenge",
    build: () => {
      const value =
        workspace();

      const revision =
        current(value);

      revision.status =
        "NEEDS_REVIEW";

      revision.challenges = [
        challenge("OPEN")
      ];

      revision.review =
        review({
          unresolved: [
            "challenge-test"
          ]
        });

      return {
        workspace: value
      };
    }
  },
  {
    id:
      "S11_INVARIANT_VERIFICATION_INCOMPLETE",
    expectedWhere:
      "02 · Review the change → Guardrails",
    expectedGoLabel:
      "Go to Guardrails",
    build: () => {
      const value =
        workspace();

      const revision =
        current(value);

      revision.status =
        "NEEDS_REVIEW";

      revision.review =
        review({
          complete: false
        });

      return {
        workspace: value
      };
    }
  },
  {
    id:
      "S12_BLOCKED_WITH_OPEN_CHALLENGE",
    expectedWhere:
      "02 · Review the change → Agent Challenges",
    expectedGoLabel:
      "Go to Agent Challenge",
    build: () => {
      const value =
        workspace();

      const revision =
        current(value);

      revision.status =
        "BLOCKED";

      revision.challenges = [
        challenge("OPEN")
      ];

      revision.review =
        review({
          guardrailViolation:
            true,
          unresolved: [
            "challenge-test"
          ]
        });

      return {
        workspace: value
      };
    }
  },
  {
    id:
      "S13_BLOCKED_GUARDRAIL",
    expectedWhere:
      conflictWhere,
    expectedGoLabel:
      "Go to conflicting rule",
    build: () => {
      const value =
        workspace();

      const revision =
        current(value);

      revision.status =
        "BLOCKED";

      revision.challenges = [
        challenge(
          "RESOLVED"
        )
      ];

      revision.review =
        review({
          guardrailViolation:
            true
        });

      return {
        workspace: value
      };
    }
  },
  {
    id:
      "S14_BLOCKED_REGRESSION",
    expectedWhere:
      conflictWhere,
    expectedGoLabel:
      "Go to conflicting rule",
    build: () => {
      const value =
        workspace();

      const revision =
        current(value);

      addKnownRegressionCase(
        value
      );

      revision.status =
        "BLOCKED";

      revision.challenges = [
        challenge(
          "RESOLVED"
        )
      ];

      revision.review =
        review({
          regression: true
        });

      return {
        workspace: value
      };
    }
  },
  {
    id:
      "S15_BLOCKED_BOTH",
    expectedWhere:
      conflictWhere,
    expectedGoLabel:
      "Go to conflicting rule",
    build: () => {
      const value =
        workspace();

      const revision =
        current(value);

      addKnownRegressionCase(
        value
      );

      revision.status =
        "BLOCKED";

      revision.challenges = [
        challenge(
          "RESOLVED"
        )
      ];

      revision.review =
        review({
          guardrailViolation:
            true,
          regression: true
        });

      return {
        workspace: value
      };
    }
  },
  {
    id:
      "S16_READY_FOR_HUMAN_APPROVAL",
    expectedWhere:
      "02 · Review the change → Approve revision 1",
    expectedGoLabel:
      "Go to approval",
    build: () => {
      const value =
        workspace();

      const revision =
        current(value);

      revision.status =
        "READY_FOR_DECISION";

      revision.challenges = [
        challenge(
          "RESOLVED"
        )
      ];

      revision.review =
        review();

      return {
        workspace: value,
        overrides: {
          baseToolCount: 0,
          baseToolsResolved:
            false,
          lastAgentError:
            "A stale Agent error."
        }
      };
    }
  },
  {
    id:
      "S17_APPLY_TOOL_REGISTERING",
    expectedWhere:
      "02 · Review the change → Apply approved revision 1",
    expectedGoLabel:
      "Go to direct apply",
    build: () => {
      const value =
        workspace();

      current(value).status =
        "APPROVED";

      value.approval = {
        revisionId:
          value
            .currentRevisionId,
        fingerprint:
          "test",
        approvedAt:
          "2026-08-30T00:00:00.000Z",
        approvedBy:
          "HUMAN"
      };

      return {
        workspace: value,
        overrides: {
          applyToolState:
            "registering"
        }
      };
    }
  },
  {
    id:
      "S18_APPROVED_DIRECT_APPLY",
    expectedWhere:
      "02 · Review the change → Apply approved revision 1",
    expectedGoLabel:
      "Go to direct apply",
    build: () => {
      const value =
        workspace();

      current(value).status =
        "APPROVED";

      value.approval = {
        revisionId:
          value
            .currentRevisionId,
        fingerprint:
          "test",
        approvedAt:
          "2026-08-30T00:00:00.000Z",
        approvedBy:
          "HUMAN"
      };

      return {
        workspace: value,
        overrides: {
          applyToolState:
            "available"
        }
      };
    }
  },
  {
    id:
      "S19_APPLY_TOOL_FAILED",
    expectedWhere:
      "02 · Review the change → Apply approved revision 1",
    expectedGoLabel:
      "Go to direct apply",
    build: () => {
      const value =
        workspace();

      current(value).status =
        "APPROVED";

      value.approval = {
        revisionId:
          value
            .currentRevisionId,
        fingerprint:
          "test",
        approvedAt:
          "2026-08-30T00:00:00.000Z",
        approvedBy:
          "HUMAN"
      };

      return {
        workspace: value,
        overrides: {
          applyToolState:
            "failed"
        }
      };
    }
  },
  {
    id:
      "S20_APPLIED_COMPLETE",
    expectedWhere:
      "Top → completion report",
    build: () => {
      const value =
        workspace();

      current(value).status =
        "APPLIED";

      return {
        workspace: value
      };
    }
  },
  {
    id:
      "S21_INVALID_CURRENT_STATE",
    expectedWhere:
      "Header → Start new work",
    expectedGoLabel:
      "Go to Start new work",
    build: () => {
      const value =
        workspace();

      current(value).status =
        "SUPERSEDED";

      return {
        workspace: value
      };
    }
  },
  {
    id:
      "S22_AGENT_TOOL_ERROR",
    expectedWhere:
      "ChatGPT Desktop → current conversation",
    build: () => ({
      workspace: workspace(),
      overrides: {
        lastAgentError:
          "Agent tool failed."
      }
    })
  }
];

describe(
  "deriveGuidanceState",
  () => {
    it(
      "keeps the exhaustive UX partition count fixed",
      () => {
        expect(
          GUIDANCE_STATE_COUNT
        ).toBe(22);

        expect(cases)
          .toHaveLength(
            GUIDANCE_STATE_COUNT
          );

        expect(
          new Set(
            cases.map(
              (item) =>
                item.id
            )
          ).size
        ).toBe(
          GUIDANCE_STATE_COUNT
        );
      }
    );

    it.each(cases)(
      "maps $id to one exact next-action destination",
      ({
        id,
        expectedWhere,
        expectedGoLabel,
        build
      }) => {
        const built =
          build();

        const result =
          derive(
            built.workspace,
            built.overrides
          );

        expect(
          result.id
        ).toBe(id);

        expect(
          result.where
        ).toBe(
          expectedWhere
        );

        expect(
          result.where
            .toLowerCase()
        ).not.toBe(
          "this page"
        );

        expect(
          result.goLabel
        ).toBe(
          expectedGoLabel
        );
      }
    );

    it(
      "keeps the optional ChatGPT instruction explicitly revision-scoped",
      () => {
        const prompt =
          approvedApplyChatGPTPrompt(
            6
          );

        expect(prompt).toContain(
          "Human authorization"
        );
        expect(prompt).toContain(
          "revision 6"
        );
        expect(prompt).toContain(
          "Stop when the workspace shows Applied"
        );
        expect(prompt).not.toContain(
          "Continue from the current workspace"
        );
      }
    );

    it(
      "marks the applied state as complete with no further action",
      () => {
        const value = workspace();

        current(value).status =
          "APPLIED";

        const result = derive(
          value,
          {
            baseToolCount: 0,
            baseToolsResolved:
              false,
            applyToolState:
              "failed",
            lastAgentError:
              "A stale Agent error."
          }
        );

        expect(result.owner).toBe(
          "WORKFLOW COMPLETE"
        );
        expect(result.detail).toContain(
          "No further action is required"
        );
        expect(result.targetId).toBe(
          "workflow-complete"
        );
      }
    );

    it(
      "uses only concrete browser destinations or the current ChatGPT conversation",
      () => {
        for (
          const item of cases
        ) {
          const built =
            item.build();

          const result =
            derive(
              built.workspace,
              built.overrides
            );

          const concrete =
            result.where.includes(
              "→"
            ) ||
            result.where ===
              "Header → Start new work";

          expect(
            concrete
          ).toBe(true);
        }
      }
    );

    it(
      "creates a copy-ready human instruction for a known-decision regression",
      () => {
        const blockedCase =
          cases.find(
            (item) =>
              item.id ===
              "S14_BLOCKED_REGRESSION"
          );

        if (!blockedCase) {
          throw new Error(
            "Regression guidance case is missing."
          );
        }

        const built =
          blockedCase.build();

        const result = derive(
          built.workspace,
          built.overrides
        );

        expect(result.prompt).toBe(
          "Human decision: Preserve the recorded Human Decision. Adjust the conflicting boundary so the failed scenario remains HUMAN_REVIEW. If the existing factors cannot safely distinguish the failed scenario, you are authorized to remove the conflicting agent-only rule. Continue with the available site tools until the next human judgment is required."
        );

        expect(
          result.returnWhen
        ).toBe(
          "Return here when ChatGPT asks for the next Human Decision."
        );
      }
    );

    it(
      "keeps Guardrails explicit when regression and Guardrail conflicts coexist",
      () => {
        const blockedCase =
          cases.find(
            (item) =>
              item.id ===
              "S15_BLOCKED_BOTH"
          );

        if (!blockedCase) {
          throw new Error(
            "Combined blocker guidance case is missing."
          );
        }

        const built =
          blockedCase.build();

        const result = derive(
          built.workspace,
          built.overrides
        );

        expect(result.prompt).toContain(
          "Preserve every non-negotiable Guardrail."
        );
      }
    );

    it(
      "makes direct apply the primary approved action without tool-count instructions",
      () => {
        const approvedCase =
          cases.find(
            (item) =>
              item.id ===
              "S18_APPROVED_DIRECT_APPLY"
          );

        if (!approvedCase) {
          throw new Error(
            "Approved direct-apply guidance case is missing."
          );
        }

        const built =
          approvedCase.build();

        const result = derive(
          built.workspace,
          built.overrides
        );

        expect(result.action).toBe(
          "Apply approved revision 1"
        );

        expect(result.detail).toContain(
          "Complete directly in this workspace"
        );

        expect(result.mode).toBe(
          "HUMAN"
        );

        expect(result.targetId).toBe(
          "next-apply-direct"
        );

        expect(result.prompt).toBeUndefined();

        expect(result.detail).toContain(
          "optional WebMCP apply route"
        );

        expect(
          `${result.action} ${result.detail} ${result.returnWhen}`
        ).not.toContain(
          "6 tools"
        );
      }
    );

    it.each([
      {
        applyToolState:
          "registering",
        expectedId:
          "S17_APPLY_TOOL_REGISTERING"
      },
      {
        applyToolState:
          "available",
        expectedId:
          "S18_APPROVED_DIRECT_APPLY"
      },
      {
        applyToolState:
          "failed",
        expectedId:
          "S19_APPLY_TOOL_FAILED"
      }
    ] as const)(
      "keeps direct apply available while the optional WebMCP route is $applyToolState",
      ({
        applyToolState,
        expectedId
      }) => {
        const value = workspace();

        current(value).status =
          "APPROVED";

        const result = derive(
          value,
          {
            applyToolState,
            baseToolCount: 0,
            baseToolsResolved:
              false,
            lastAgentError:
              "A stale Agent error."
          }
        );

        expect(result.id).toBe(
          expectedId
        );
        expect(result.mode).toBe(
          "HUMAN"
        );
        expect(result.action).toBe(
          "Apply approved revision 1"
        );
        expect(result.targetId).toBe(
          "next-apply-direct"
        );
        expect(result.goLabel).toBe(
          "Go to direct apply"
        );
      }
    );

    it.each([
      {
        condition:
          "base tools are unresolved",
        overrides: {
          baseToolsResolved:
            false
        }
      },
      {
        condition:
          "no base tools are detected",
        overrides: {
          baseToolCount: 0
        }
      },
      {
        condition:
          "base tools are partially registered",
        overrides: {
          baseToolCount: 3
        }
      },
      {
        condition:
          "a stale Agent error remains",
        overrides: {
          lastAgentError:
            "A stale Agent error."
        }
      }
    ] as const)(
      "keeps human direct apply primary when $condition",
      ({ overrides }) => {
        const value = workspace();

        current(value).status =
          "APPROVED";

        const result = derive(
          value,
          {
            ...overrides,
            applyToolState:
              "available"
          }
        );

        expect(result.id).toBe(
          "S18_APPROVED_DIRECT_APPLY"
        );
        expect(result.mode).toBe(
          "HUMAN"
        );
        expect(result.targetId).toBe(
          "next-apply-direct"
        );
      }
    );

    it.each([
      {
        condition:
          "base tools are unresolved",
        overrides: {
          baseToolsResolved:
            false
        }
      },
      {
        condition:
          "no base tools are detected",
        overrides: {
          baseToolCount: 0
        }
      },
      {
        condition:
          "base tools are partially registered",
        overrides: {
          baseToolCount: 3
        }
      },
      {
        condition:
          "a stale Agent error remains",
        overrides: {
          lastAgentError:
            "A stale Agent error."
        }
      }
    ] as const)(
      "keeps the completion report terminal when $condition",
      ({ overrides }) => {
        const value = workspace();

        current(value).status =
          "APPLIED";

        const result = derive(
          value,
          overrides
        );

        expect(result.id).toBe(
          "S20_APPLIED_COMPLETE"
        );
        expect(result.mode).toBe(
          "COMPLETE"
        );
        expect(result.targetId).toBe(
          "workflow-complete"
        );
      }
    );
  }
);
