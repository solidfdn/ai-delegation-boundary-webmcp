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
  deriveGuidanceState,
  GUIDANCE_STATE_COUNT,
  type ApplyToolState,
  type GuidanceStateId
} from "./guidance";

function workspace() {
  const value =
    createInteractiveDelegationWorkspace();

  value.task = {
    title: "Customer refund decisions"
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
            decision: "KEEP_HUMAN",
            note: "Human decided."
          }
        : undefined
  };
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
    options.guardrailViolation ??
    false;

  const regression =
    options.regression ?? false;

  const challengeCount =
    options.challengeCount ?? 1;

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
              violated: true
            }
          ]
        : [],

    guardrailVerificationComplete:
      complete,

    guardrailStatesChecked:
      complete ? 1 : 0,

    guardrailsChecked:
      guardrailViolation ? 1 : 0,

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
  lastAgentError?: string | null;
}

function derive(
  value: DelegationWorkspace,
  overrides:
    InputOverrides = {}
) {
  return deriveGuidanceState({
    workspace: value,
    baseToolCount:
      overrides.baseToolCount ?? 5,
    baseToolsResolved:
      overrides.baseToolsResolved ??
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
  build: () => {
    workspace: DelegationWorkspace;
    overrides?: InputOverrides;
  };
};

const cases: Case[] = [
  {
    id: "S01_SCOPE_WORK",
    build: () => ({
      workspace:
        createInteractiveDelegationWorkspace()
    })
  },
  {
    id: "S02_CHECKING_WEBMCP",
    build: () => ({
      workspace: workspace(),
      overrides: {
        baseToolsResolved: false
      }
    })
  },
  {
    id: "S03_WEBMCP_NOT_DETECTED",
    build: () => ({
      workspace: workspace(),
      overrides: {
        baseToolCount: 0
      }
    })
  },
  {
    id: "S04_WEBMCP_DEGRADED",
    build: () => ({
      workspace: workspace(),
      overrides: {
        baseToolCount: 3
      }
    })
  },
  {
    id: "S05_INITIAL_AGENT_HANDOFF",
    build: () => ({
      workspace: workspace()
    })
  },
  {
    id: "S06_FRESH_CHALLENGE_HANDOFF",
    build: () => {
      const value = workspace();
      const revision = current(value);
      revision.id = "delegation-demo-r2";
      revision.version = 2;
      value.currentRevisionId =
        revision.id;

      return {
        workspace: value
      };
    }
  },
  {
    id: "S07_HUMAN_CHALLENGE",
    build: () => {
      const value = workspace();
      current(value).challenges = [
        challenge("OPEN")
      ];

      return {
        workspace: value
      };
    }
  },
  {
    id: "S08_CONTINUE_TO_REVIEW",
    build: () => {
      const value = workspace();
      current(value).challenges = [
        challenge("RESOLVED")
      ];

      return {
        workspace: value
      };
    }
  },
  {
    id: "S09_REVIEW_NEEDS_CHALLENGE",
    build: () => {
      const value = workspace();
      const revision = current(value);

      revision.status =
        "NEEDS_REVIEW";

      revision.review = review({
        challengeCount: 0
      });

      return {
        workspace: value
      };
    }
  },
  {
    id: "S10_REVIEW_HAS_OPEN_CHALLENGE",
    build: () => {
      const value = workspace();
      const revision = current(value);

      revision.status =
        "NEEDS_REVIEW";

      revision.challenges = [
        challenge("OPEN")
      ];

      revision.review = review({
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
    build: () => {
      const value = workspace();
      const revision = current(value);

      revision.status =
        "NEEDS_REVIEW";

      revision.review = review({
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
    build: () => {
      const value = workspace();
      const revision = current(value);

      revision.status = "BLOCKED";
      revision.challenges = [
        challenge("OPEN")
      ];

      revision.review = review({
        guardrailViolation: true,
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
    id: "S13_BLOCKED_GUARDRAIL",
    build: () => {
      const value = workspace();
      const revision = current(value);

      revision.status = "BLOCKED";
      revision.challenges = [
        challenge("RESOLVED")
      ];

      revision.review = review({
        guardrailViolation: true
      });

      return {
        workspace: value
      };
    }
  },
  {
    id: "S14_BLOCKED_REGRESSION",
    build: () => {
      const value = workspace();
      const revision = current(value);

      revision.status = "BLOCKED";
      revision.challenges = [
        challenge("RESOLVED")
      ];

      revision.review = review({
        regression: true
      });

      return {
        workspace: value
      };
    }
  },
  {
    id: "S15_BLOCKED_BOTH",
    build: () => {
      const value = workspace();
      const revision = current(value);

      revision.status = "BLOCKED";
      revision.challenges = [
        challenge("RESOLVED")
      ];

      revision.review = review({
        guardrailViolation: true,
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
    build: () => {
      const value = workspace();
      const revision = current(value);

      revision.status =
        "READY_FOR_DECISION";

      revision.challenges = [
        challenge("RESOLVED")
      ];

      revision.review = review();

      return {
        workspace: value
      };
    }
  },
  {
    id:
      "S17_APPLY_TOOL_REGISTERING",
    build: () => {
      const value = workspace();
      current(value).status =
        "APPROVED";

      value.approval = {
        revisionId:
          value.currentRevisionId,
        fingerprint: "test",
        approvedAt:
          "2026-08-30T00:00:00.000Z",
        approvedBy: "HUMAN"
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
      "S18_APPROVED_AGENT_HANDOFF",
    build: () => {
      const value = workspace();
      current(value).status =
        "APPROVED";

      value.approval = {
        revisionId:
          value.currentRevisionId,
        fingerprint: "test",
        approvedAt:
          "2026-08-30T00:00:00.000Z",
        approvedBy: "HUMAN"
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
    id: "S19_APPLY_TOOL_FAILED",
    build: () => {
      const value = workspace();
      current(value).status =
        "APPROVED";

      value.approval = {
        revisionId:
          value.currentRevisionId,
        fingerprint: "test",
        approvedAt:
          "2026-08-30T00:00:00.000Z",
        approvedBy: "HUMAN"
      };

      return {
        workspace: value,
        overrides: {
          applyToolState: "failed"
        }
      };
    }
  },
  {
    id: "S20_APPLIED_COMPLETE",
    build: () => {
      const value = workspace();
      current(value).status =
        "APPLIED";

      return {
        workspace: value
      };
    }
  },
  {
    id: "S21_INVALID_CURRENT_STATE",
    build: () => {
      const value = workspace();
      current(value).status =
        "SUPERSEDED";

      return {
        workspace: value
      };
    }
  },
  {
    id: "S22_AGENT_TOOL_ERROR",
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

        expect(cases).toHaveLength(
          GUIDANCE_STATE_COUNT
        );

        expect(
          new Set(
            cases.map(
              (item) => item.id
            )
          ).size
        ).toBe(
          GUIDANCE_STATE_COUNT
        );
      }
    );

    it.each(cases)(
      "maps $id to one explicit next action",
      ({ id, build }) => {
        const built = build();

        expect(
          derive(
            built.workspace,
            built.overrides
          ).id
        ).toBe(id);
      }
    );
  }
);
