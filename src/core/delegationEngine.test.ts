import {
  describe,
  expect,
  it
} from "vitest";

import {
  applyApprovedRevision,
  approveCurrentRevision,
  createEditedRevision,
  getCurrentRevision,
  reviewRevision
} from "./delegationEngine";

import {
  delegationBoundaryDemoWorkspace
} from "../domains/delegation-boundary-demo";

import type {
  DelegationWorkspace
} from "./types";

function cloneWorkspace():
  DelegationWorkspace {
  return JSON.parse(
    JSON.stringify(
      delegationBoundaryDemoWorkspace
    )
  ) as DelegationWorkspace;
}

function reviewCurrent(
  workspace: DelegationWorkspace
): DelegationWorkspace {
  const current =
    getCurrentRevision(workspace);

  const reviewed =
    reviewRevision(
      current,
      workspace.factors,
      "2026-08-29T01:00:00.000Z"
    );

  return {
    ...workspace,

    revisions:
      workspace.revisions.map(
        (revision) =>
          revision.id === reviewed.id
            ? reviewed
            : revision
      )
  };
}

function resolveAllChallenges(
  workspace: DelegationWorkspace
): DelegationWorkspace {
  return createEditedRevision(
    workspace,
    "HUMAN",
    "Human resolved all agent challenges",

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
                "Human reviewed this scenario and retained the existing boundary."
            }
          })
        );
    },

    "2026-08-29T02:00:00.000Z"
  );
}

describe(
  "AI Delegation Boundary quality model",
  () => {
    it(
      "does not call an unreviewed revision ready",
      () => {
        const workspace =
          reviewCurrent(
            cloneWorkspace()
          );

        const current =
          getCurrentRevision(
            workspace
          );

        expect(
          current.status
        ).toBe(
          "NEEDS_REVIEW"
        );

        expect(
          current.review
            ?.unresolvedChallengeIds
            .length
        ).toBe(3);

        expect(
          current.review?.guardrails
            .some(
              (result) =>
                result.violated
            )
        ).toBe(false);

        expect(
          current.review?.regressions
            .every(
              (result) =>
                result.passed
            )
        ).toBe(true);
      }
    );

    it(
      "blocks a revision that widens authority across a guardrail and a known human decision",
      () => {
        let workspace =
          cloneWorkspace();

        workspace =
          createEditedRevision(
            workspace,
            "AGENT",

            "Proposed wider autonomous completion",

            (revision) => {
              /*
               * Deliberately unsafe proposal:
               * remove the irreversible stop rule.
               */
              revision.boundary.rules =
                revision.boundary.rules
                  .filter(
                    (rule) =>
                      rule.id !==
                      "rule-irreversible"
                  );

              const agentRule =
                revision.boundary.rules
                  .find(
                    (rule) =>
                      rule.id ===
                      "rule-agent-standard"
                  );

              if (!agentRule) {
                throw new Error(
                  "Agent rule missing"
                );
              }

              /*
               * Expand low impact to medium impact.
               */
              const impact =
                agentRule.when.find(
                  (condition) =>
                    condition.factorId ===
                    "impact"
                );

              if (!impact) {
                throw new Error(
                  "Impact condition missing"
                );
              }

              impact.value =
                "MEDIUM";

              /*
               * Also remove reversibility from the
               * autonomous rule.
               */
              agentRule.when =
                agentRule.when.filter(
                  (condition) =>
                    condition.factorId !==
                    "reversibility"
                );
            },

            "2026-08-29T03:00:00.000Z"
          );

        workspace =
          reviewCurrent(
            workspace
          );

        const current =
          getCurrentRevision(
            workspace
          );

        expect(
          current.status
        ).toBe(
          "BLOCKED"
        );

        expect(
          current.review?.guardrails
            .some(
              (result) =>
                result.violated
            )
        ).toBe(true);

        expect(
          current.review?.regressions
            .some(
              (result) =>
                !result.passed
            )
        ).toBe(true);
      }
    );

    it(
      "becomes ready only after the human resolves every open challenge",
      () => {
        let workspace =
          cloneWorkspace();

        workspace =
          resolveAllChallenges(
            workspace
          );

        workspace =
          reviewCurrent(
            workspace
          );

        const current =
          getCurrentRevision(
            workspace
          );

        expect(
          current.status
        ).toBe(
          "READY_FOR_DECISION"
        );

        expect(
          current.review
            ?.unresolvedChallengeIds
        ).toHaveLength(0);

        expect(
          current.review?.guardrails
            .every(
              (result) =>
                !result.violated
            )
        ).toBe(true);

        expect(
          current.review?.regressions
            .every(
              (result) =>
                result.passed
            )
        ).toBe(true);
      }
    );

    it(
      "approves and applies only the exact reviewed revision",
      async () => {
        let workspace =
          cloneWorkspace();

        workspace =
          resolveAllChallenges(
            workspace
          );

        workspace =
          reviewCurrent(
            workspace
          );

        workspace =
          await approveCurrentRevision(
            workspace,
            "2026-08-29T04:00:00.000Z"
          );

        const approved =
          getCurrentRevision(
            workspace
          );

        expect(
          approved.status
        ).toBe(
          "APPROVED"
        );

        expect(
          workspace.approval
            ?.fingerprint
        ).toMatch(
          /^[a-f0-9]{64}$/
        );

        workspace =
          await applyApprovedRevision(
            workspace,
            "2026-08-29T05:00:00.000Z"
          );

        expect(
          getCurrentRevision(
            workspace
          ).status
        ).toBe(
          "APPLIED"
        );

        expect(
          workspace.application
            ?.revisionId
        ).toBe(
          workspace.currentRevisionId
        );
      }
    );

    it(
      "rejects apply when an approved revision is changed after approval",
      async () => {
        let workspace =
          cloneWorkspace();

        workspace =
          resolveAllChallenges(
            workspace
          );

        workspace =
          reviewCurrent(
            workspace
          );

        workspace =
          await approveCurrentRevision(
            workspace
          );

        /*
         * Simulate malicious or accidental
         * post-approval mutation.
         */
        const current =
          getCurrentRevision(
            workspace
          );

        current.boundary.label =
          "Tampered after approval";

        await expect(
          applyApprovedRevision(
            workspace
          )
        ).rejects.toThrow(
          "fingerprint no longer matches"
        );
      }
    );

    it(
      "invalidates prior approval whenever a new revision is created",
      async () => {
        let workspace =
          cloneWorkspace();

        workspace =
          resolveAllChallenges(
            workspace
          );

        workspace =
          reviewCurrent(
            workspace
          );

        workspace =
          await approveCurrentRevision(
            workspace
          );

        expect(
          workspace.approval
        ).toBeDefined();

        const approvedRevisionId =
          workspace.currentRevisionId;

        workspace =
          createEditedRevision(
            workspace,
            "HUMAN",

            "Human changed the boundary after approval",

            (revision) => {
              revision.boundary.label =
                "Revised boundary";
            }
          );

        expect(
          workspace.approval
        ).toBeUndefined();

        expect(
          workspace.currentRevisionId
        ).not.toBe(
          approvedRevisionId
        );

        expect(
          getCurrentRevision(
            workspace
          ).status
        ).toBe(
          "DRAFT"
        );

        const oldRevision =
          workspace.revisions.find(
            (revision) =>
              revision.id ===
              approvedRevisionId
          );

        expect(
          oldRevision?.status
        ).toBe(
          "SUPERSEDED"
        );
      }
    );

    it(
      "preserves an applied revision as history when later work begins",
      async () => {
        let workspace =
          cloneWorkspace();

        workspace =
          resolveAllChallenges(
            workspace
          );

        workspace =
          reviewCurrent(
            workspace
          );

        workspace =
          await approveCurrentRevision(
            workspace
          );

        workspace =
          await applyApprovedRevision(
            workspace
          );

        const appliedRevisionId =
          workspace.currentRevisionId;

        workspace =
          createEditedRevision(
            workspace,
            "HUMAN",
            "Started a later review",
            (revision) => {
              revision.changeSummary =
                "Started a later review";
            }
          );

        const historical =
          workspace.revisions.find(
            (revision) =>
              revision.id ===
              appliedRevisionId
          );

        expect(
          historical?.status
        ).toBe(
          "APPLIED"
        );

        expect(
          workspace.application
            ?.revisionId
        ).toBe(
          appliedRevisionId
        );

        expect(
          getCurrentRevision(
            workspace
          ).status
        ).toBe(
          "DRAFT"
        );
      }
    );
  }
);
