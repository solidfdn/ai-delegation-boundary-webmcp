import {
  describe,
  expect,
  it
} from "vitest";

import {
  applyApprovedRevision as applyApprovedRevisionTransition,
  approveCurrentRevision,
  createEditedRevision,
  getCurrentRevision,
  reviewRevision
} from "../core/delegationEngine";

import {
  createApprovedRevisionApplyCoordinator,
  type ApprovedRevisionTransition
} from "../core/approvedRevisionApplication";

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

function createHarness(
  transition?:
    ApprovedRevisionTransition
) {
  let workspace =
    cloneWorkspace();

  let applicationCommitCount =
    0;

  const now = () =>
    "2026-08-29T10:00:00.000Z";

  const applyCoordinator =
    createApprovedRevisionApplyCoordinator({
      getWorkspace: () =>
        workspace,

      commitWorkspace: (
        expected,
        next
      ) => {
        if (
          workspace !== expected
        ) {
          return false;
        }

        applicationCommitCount +=
          1;
        workspace = next;
        return true;
      },

      now,
      transition
    });

  const actions =
    createDelegationBoundaryToolActions(
      () => workspace,

      (next) => {
        workspace = next;
      },

      now,

      applyCoordinator
    );

  return {
    actions,
    applyCoordinator,

    get applicationCommitCount() {
      return applicationCommitCount;
    },

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

function deferred() {
  let release:
    () => void =
      () => {};

  const promise =
    new Promise<void>(
      (resolve) => {
        release = resolve;
      }
    );

  return {
    promise,
    release
  };
}

function resultStatus(
  result: unknown
): unknown {
  if (
    !result ||
    typeof result !== "object" ||
    !("status" in result)
  ) {
    return undefined;
  }

  return result.status;
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
      "keeps implementation-only verification counts and fingerprints out of Agent-facing WebMCP output",
      async () => {
        const harness =
          createHarness();

        harness.workspace =
          resolveChallengesAndReview(
            harness.workspace
          );

        const internalReview =
          getCurrentRevision(
            harness.workspace
          ).review;

        expect(
          internalReview
            ?.guardrailStatesChecked
        ).toBeGreaterThan(0);

        const inspectTool =
          createDelegationToolDefinitions(
            harness.actions
          ).find(
            (candidate) =>
              candidate.name ===
              "inspect_delegation_workspace"
          )!;

        const inspectResult =
          await inspectTool.execute(
            {}
          );

        const inspectJson =
          JSON.stringify(
            inspectResult
          );

        expect(
          inspectJson
        ).not.toContain(
          "guardrailStatesChecked"
        );

        expect(
          inspectJson
        ).not.toContain(
          "\"fingerprint\""
        );

        expect(
          inspectJson
        ).not.toContain(
          "243"
        );

        harness.workspace =
          await approveCurrentRevision(
            harness.workspace,
            "2026-08-29T13:00:00.000Z"
          );

        const approvedInspect =
          await inspectTool.execute(
            {}
          );

        expect(
          JSON.stringify(
            approvedInspect
          )
        ).not.toContain(
          "\"fingerprint\""
        );

        const applyTool =
          createApplyApprovedRevisionToolDefinition(
            harness.actions
          );

        expect(
          applyTool.description
        ).not.toContain(
          "SHA-256"
        );

        const applyResult =
          await applyTool.execute(
            {}
          );

        const applyJson =
          JSON.stringify(
            applyResult
          );

        expect(
          applyJson
        ).not.toContain(
          "\"fingerprint\""
        );

        expect(
          applyJson
        ).not.toContain(
          "SHA-256"
        );

        expect(
          applyJson
        ).toContain(
          "exact current revision"
        );
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
          resultStatus(result)
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
          resultStatus(result)
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
                "MEDIUM",

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
              "An exceptional case with only medium-quality evidence may still require human judgment even when operational impact is low.",

            suggested_outcome:
              "HUMAN_REVIEW"
          });

        expect(
          resultStatus(result)
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
          resultStatus(result)
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
          resultStatus(result)
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
          resultStatus(result)
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
      "blocks WebMCP while the Human direct application owns the shared coordinator",
      async () => {
        const gate = deferred();
        let transitionCount = 0;

        const harness =
          createHarness(
            async (
              workspace,
              appliedAt
            ) => {
              transitionCount += 1;
              await gate.promise;

              return applyApprovedRevisionTransition(
                workspace,
                appliedAt
              );
            }
          );

        harness.workspace =
          await approveCurrentRevision(
            resolveChallengesAndReview(
              harness.workspace
            )
          );

        const directApplication =
          harness.applyCoordinator
            .apply();

        const applyTool =
          createApplyApprovedRevisionToolDefinition(
            harness.actions
          );

        const agentResult =
          await applyTool.execute(
            {}
          );

        gate.release();
        await directApplication;

        expect(agentResult).toMatchObject({
          status: "blocked",
          code:
            "APPLICATION_IN_PROGRESS"
        });

        expect(transitionCount).toBe(1);
        expect(
          harness
            .applicationCommitCount
        ).toBe(1);
        expect(
          getCurrentRevision(
            harness.workspace
          ).status
        ).toBe("APPLIED");
      }
    );

    it(
      "blocks Human direct application while WebMCP owns the shared coordinator",
      async () => {
        const gate = deferred();
        let transitionCount = 0;

        const harness =
          createHarness(
            async (
              workspace,
              appliedAt
            ) => {
              transitionCount += 1;
              await gate.promise;

              return applyApprovedRevisionTransition(
                workspace,
                appliedAt
              );
            }
          );

        harness.workspace =
          await approveCurrentRevision(
            resolveChallengesAndReview(
              harness.workspace
            )
          );

        const applyTool =
          createApplyApprovedRevisionToolDefinition(
            harness.actions
          );

        const agentApplication =
          Promise.resolve(
            applyTool.execute({})
          );

        const directError =
          await harness
            .applyCoordinator
            .apply()
            .then(
              () => null,
              (error: unknown) =>
                error
            );

        gate.release();

        const agentResult =
          await agentApplication;

        expect(directError).toMatchObject({
          code:
            "APPLICATION_IN_PROGRESS"
        });
        expect(agentResult).toMatchObject({
          status: "success"
        });
        expect(transitionCount).toBe(1);
        expect(
          harness
            .applicationCommitCount
        ).toBe(1);
      }
    );

    it(
      "allows only one concurrent WebMCP application to commit",
      async () => {
        const gate = deferred();
        let transitionCount = 0;

        const harness =
          createHarness(
            async (
              workspace,
              appliedAt
            ) => {
              transitionCount += 1;
              await gate.promise;

              return applyApprovedRevisionTransition(
                workspace,
                appliedAt
              );
            }
          );

        harness.workspace =
          await approveCurrentRevision(
            resolveChallengesAndReview(
              harness.workspace
            )
          );

        const applyTool =
          createApplyApprovedRevisionToolDefinition(
            harness.actions
          );

        const winner =
          Promise.resolve(
            applyTool.execute({})
          );

        const loser =
          await applyTool.execute(
            {}
          );

        gate.release();

        const winnerResult =
          await winner;

        expect(winnerResult).toMatchObject({
          status: "success"
        });
        expect(loser).toMatchObject({
          status: "blocked",
          code:
            "APPLICATION_IN_PROGRESS"
        });
        expect(transitionCount).toBe(1);
        expect(
          harness
            .applicationCommitCount
        ).toBe(1);
      }
    );

    it(
      "rejects a verified result if the workspace changes before commit",
      async () => {
        const gate = deferred();

        const harness =
          createHarness(
            async (
              workspace,
              appliedAt
            ) => {
              await gate.promise;

              return applyApprovedRevisionTransition(
                workspace,
                appliedAt
              );
            }
          );

        harness.workspace =
          await approveCurrentRevision(
            resolveChallengesAndReview(
              harness.workspace
            )
          );

        const pending =
          harness.actions
            .applyApprovedRevision();

        const replacement =
          createEditedRevision(
            harness.workspace,
            "HUMAN",
            "Human changed the workspace during application",
            (revision) => {
              revision.boundary.label =
                "Replacement boundary";
            }
          );

        harness.workspace =
          replacement;
        gate.release();

        const result =
          await pending;

        expect(result).toMatchObject({
          status: "blocked",
          code:
            "WORKSPACE_CHANGED_DURING_APPLICATION"
        });
        expect(
          harness.workspace
        ).toBe(replacement);
        expect(
          harness
            .applicationCommitCount
        ).toBe(0);
        expect(
          getCurrentRevision(
            harness.workspace
          ).boundary.label
        ).toBe(
          "Replacement boundary"
        );
      }
    );

    it(
      "releases the coordinator after a failed transition so the Human can retry",
      async () => {
        let transitionCount = 0;

        const harness =
          createHarness(
            async (
              workspace,
              appliedAt
            ) => {
              transitionCount += 1;

              if (
                transitionCount === 1
              ) {
                throw new Error(
                  "Injected transition failure"
                );
              }

              return applyApprovedRevisionTransition(
                workspace,
                appliedAt
              );
            }
          );

        harness.workspace =
          await approveCurrentRevision(
            resolveChallengesAndReview(
              harness.workspace
            )
          );

        const firstResult =
          await harness.actions
            .applyApprovedRevision();

        expect(firstResult).toMatchObject({
          status: "blocked",
          code:
            "APPROVED_REVISION_NOT_APPLIED",
          message:
            "Injected transition failure"
        });

        await harness.applyCoordinator
          .apply();

        expect(transitionCount).toBe(2);
        expect(
          harness
            .applicationCommitCount
        ).toBe(1);
        expect(
          getCurrentRevision(
            harness.workspace
          ).status
        ).toBe("APPLIED");
      }
    );

    it(
      "rejects sequential reapplication without changing the original application record",
      async () => {
        const harness =
          createHarness();

        harness.workspace =
          await approveCurrentRevision(
            resolveChallengesAndReview(
              harness.workspace
            )
          );

        await harness.applyCoordinator
          .apply();

        const appliedAt =
          harness.workspace
            .application
            ?.appliedAt;

        const result =
          await harness.actions
            .applyApprovedRevision();

        expect(result).toMatchObject({
          status: "blocked",
          code:
            "APPROVED_REVISION_NOT_APPLIED"
        });
        expect(
          harness.workspace
            .application
            ?.appliedAt
        ).toBe(appliedAt);
        expect(
          harness
            .applicationCommitCount
        ).toBe(1);
      }
    );
  }
);
