import {
  describe,
  expect,
  it
} from "vitest";

import {
  approveCurrentRevision,
  createEditedRevision,
  getCurrentRevision,
  reviewRevision
} from "../core/delegationEngine";

import type {
  DelegationWorkspace
} from "../core/types";

import {
  delegationBoundaryDemoWorkspace
} from "../domains/delegation-boundary-demo";

import {
  createDelegationBoundaryToolActions
} from "./delegationActions";

import {
  createApplyApprovedRevisionToolDefinition,
  createDelegationToolDefinitions
} from "./registerDelegationTools";

function cloneWorkspace():
  DelegationWorkspace {
  return JSON.parse(
    JSON.stringify(
      delegationBoundaryDemoWorkspace
    )
  ) as DelegationWorkspace;
}

function createHarness() {
  let workspace =
    cloneWorkspace();

  const actions =
    createDelegationBoundaryToolActions(
      () => workspace,

      (next) => {
        workspace = next;
      },

      () =>
        "2026-08-29T10:00:00.000Z"
    );

  return {
    actions,

    get workspace() {
      return workspace;
    },

    set workspace(
      next:
        DelegationWorkspace
    ) {
      workspace = next;
    }
  };
}

function resolveChallengesAndReview(
  workspace:
    DelegationWorkspace
): DelegationWorkspace {
  let next =
    createEditedRevision(
      workspace,
      "HUMAN",
      "Human resolved every open challenge",

      (revision) => {
        revision.challenges =
          revision.challenges.map(
            (challenge) => ({
              ...challenge,

              status:
                "RESOLVED",

              humanResolution: {
                decision:
                  "KEEP_HUMAN",

                note:
                  "Reviewed by the human."
              }
            })
          );
      },

      "2026-08-29T11:00:00.000Z"
    );

  const current =
    getCurrentRevision(next);

  const reviewed =
    reviewRevision(
      current,
      next.factors,
      "2026-08-29T12:00:00.000Z"
    );

  next = {
    ...next,

    revisions:
      next.revisions.map(
        (revision) =>
          revision.id ===
          reviewed.id
            ? reviewed
            : revision
      )
  };

  return next;
}

describe(
  "WebMCP Delegation Boundary surface",
  () => {
    it(
      "exposes five collaboration tools and no approval/apply tool in the normal surface",
      () => {
        const harness =
          createHarness();

        const tools =
          createDelegationToolDefinitions(
            harness.actions
          );

        expect(
          tools.map(
            (tool) =>
              tool.name
          )
        ).toEqual([
          "inspect_delegation_workspace",
          "propose_boundary_revision",
          "challenge_boundary_revision",
          "review_delegation_revision",
          "inspect_revision_history"
        ]);

        expect(
          tools.some(
            (tool) =>
              tool.name.includes(
                "approve"
              )
          )
        ).toBe(false);

        expect(
          tools.some(
            (tool) =>
              tool.name.includes(
                "apply"
              )
          )
        ).toBe(false);
      }
    );

    it(
      "lets the agent create a candidate revision without changing protected guardrails or known decisions",
      async () => {
        const harness =
          createHarness();

        const before =
          cloneWorkspace();

        const tool =
          createDelegationToolDefinitions(
            harness.actions
          ).find(
            (candidate) =>
              candidate.name ===
              "propose_boundary_revision"
          );

        expect(
          tool
        ).toBeDefined();

        const result =
          await tool!.execute({
            operation: "UPSERT",

            change_summary:
              "Agent proposes widening the standard rule to medium impact.",

            rule_id:
              "rule-agent-standard",

            when: [
              {
                factor_id:
                  "evidence_quality",
                operator:
                  "AT_LEAST",
                value:
                  "HIGH"
              },

              {
                factor_id:
                  "impact",
                operator:
                  "AT_MOST",
                value:
                  "MEDIUM"
              },

              {
                factor_id:
                  "reversibility",
                operator:
                  "EQ",
                value:
                  "REVERSIBLE"
              },

              {
                factor_id:
                  "policy_clarity",
                operator:
                  "EQ",
                value:
                  "CLEAR"
              },

              {
                factor_id:
                  "exceptionality",
                operator:
                  "EQ",
                value:
                  "STANDARD"
              }
            ]
          });

        expect(
          (
            result as
              Record<
                string,
                unknown
              >
          ).status
        ).toBe(
          "success"
        );

        expect(
          harness.workspace
            .revisions
            .length
        ).toBe(2);

        const current =
          getCurrentRevision(
            harness.workspace
          );

        expect(
          current.status
        ).toBe(
          "DRAFT"
        );

        expect(
          current.guardrails
        ).toEqual(
          before
            .revisions[0]
            .guardrails
        );

        expect(
          current
            .knownDecisions
        ).toEqual(
          before
            .revisions[0]
            .knownDecisions
        );

        expect(
          harness.workspace
            .approval
        ).toBeUndefined();
      }
    );

    it(
      "rejects a proposed rule that references an unknown decision factor",
      async () => {
        const harness =
          createHarness();

        const tool =
          createDelegationToolDefinitions(
            harness.actions
          ).find(
            (candidate) =>
              candidate.name ===
              "propose_boundary_revision"
          )!;

        const beforeCount =
          harness.workspace
            .revisions
            .length;

        const result =
          await tool.execute({
            operation: "UPSERT",

            change_summary:
              "Invalid proposal",

            rule_id:
              "invalid-rule",

            label:
              "Invalid rule",

            priority: 99,

            outcome:
              "AGENT_ONLY",

            when: [
              {
                factor_id:
                  "nonexistent_factor",
                operator:
                  "EQ",
                value:
                  "YES"
              }
            ]
          });

        expect(
          (
            result as
              Record<
                string,
                unknown
              >
          ).status
        ).toBe(
          "error"
        );

        expect(
          harness.workspace
            .revisions
            .length
        ).toBe(
          beforeCount
        );
      }
    );

    it(
      "lets the agent create a challenge but not resolve it for the human",
      async () => {
        const harness =
          createHarness();

        const tool =
          createDelegationToolDefinitions(
            harness.actions
          ).find(
            (candidate) =>
              candidate.name ===
              "challenge_boundary_revision"
          )!;

        const result =
          await tool.execute({
            title:
              "Could a reversible exception still need human judgment?",

            scenario: {
              evidence_quality:
                "HIGH",

              impact:
                "LOW",

              reversibility:
                "REVERSIBLE",

              policy_clarity:
                "CLEAR",

              exceptionality:
                "EXCEPTION"
            },

            why_it_matters:
              "Low operational risk does not necessarily make an exceptional case routine.",

            suggested_outcome:
              "HUMAN_REVIEW"
          });

        expect(
          (
            result as
              Record<
                string,
                unknown
              >
          ).status
        ).toBe(
          "success"
        );

        const current =
          getCurrentRevision(
            harness.workspace
          );

        const newest =
          current
            .challenges[
              current
                .challenges
                .length - 1
            ];

        expect(
          newest.status
        ).toBe(
          "OPEN"
        );

        expect(
          newest
            .humanResolution
        ).toBeUndefined();
      }
    );

    it(
      "reviews the current revision but never turns READY_FOR_DECISION into human approval",
      async () => {
        const harness =
          createHarness();

        harness.workspace =
          resolveChallengesAndReview(
            harness.workspace
          );

        const current =
          getCurrentRevision(
            harness.workspace
          );

        expect(
          current.status
        ).toBe(
          "READY_FOR_DECISION"
        );

        expect(
          harness.workspace
            .approval
        ).toBeUndefined();

        expect(
          createDelegationToolDefinitions(
            harness.actions
          ).some(
            (tool) =>
              tool.name ===
              "approve_revision"
          )
        ).toBe(false);
      }
    );

    it(
      "keeps apply blocked before explicit human approval",
      async () => {
        const harness =
          createHarness();

        const applyTool =
          createApplyApprovedRevisionToolDefinition(
            harness.actions
          );

        const result =
          await applyTool.execute(
            {}
          );

        expect(
          (
            result as
              Record<
                string,
                unknown
              >
          ).status
        ).toBe(
          "blocked"
        );

        expect(
          getCurrentRevision(
            harness.workspace
          ).status
        ).not.toBe(
          "APPLIED"
        );
      }
    );

    it(
      "applies only after the human approves the exact READY revision",
      async () => {
        const harness =
          createHarness();

        let workspace =
          resolveChallengesAndReview(
            harness.workspace
          );

        workspace =
          await approveCurrentRevision(
            workspace,
            "2026-08-29T13:00:00.000Z"
          );

        harness.workspace =
          workspace;

        expect(
          harness.workspace
            .approval
            ?.fingerprint
        ).toMatch(
          /^[a-f0-9]{64}$/
        );

        const applyTool =
          createApplyApprovedRevisionToolDefinition(
            harness.actions
          );

        expect(
          applyTool.name
        ).toBe(
          "apply_approved_revision"
        );

        const result =
          await applyTool.execute(
            {}
          );

        expect(
          (
            result as
              Record<
                string,
                unknown
              >
          ).status
        ).toBe(
          "success"
        );

        expect(
          getCurrentRevision(
            harness.workspace
          ).status
        ).toBe(
          "APPLIED"
        );
      }
    );

    it(
      "refuses application if the approved state was tampered with",
      async () => {
        const harness =
          createHarness();

        let workspace =
          resolveChallengesAndReview(
            harness.workspace
          );

        workspace =
          await approveCurrentRevision(
            workspace
          );

        const current =
          getCurrentRevision(
            workspace
          );

        current.boundary.label =
          "Tampered boundary";

        harness.workspace =
          workspace;

        const applyTool =
          createApplyApprovedRevisionToolDefinition(
            harness.actions
          );

        const result =
          await applyTool.execute(
            {}
          );

        expect(
          (
            result as
              Record<
                string,
                unknown
              >
          ).status
        ).toBe(
          "blocked"
        );

        expect(
          getCurrentRevision(
            harness.workspace
          ).status
        ).not.toBe(
          "APPLIED"
        );
      }
    );
  }
);
