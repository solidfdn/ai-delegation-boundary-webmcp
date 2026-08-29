import {
  describe,
  expect,
  it
} from "vitest";

import {
  createEditedRevision,
  getCurrentRevision,
  reviewRevision
} from "./delegationEngine";

import {
  editBoundaryConditionAsHuman,
  resolveChallengeAsHuman,
  scopeDelegationTaskAsHuman
} from "./delegationHuman";

import {
  createInteractiveDelegationWorkspace
} from "../domains/interactive-delegation-workspace";

import {
  delegationBoundaryDemoWorkspace
} from "../domains/delegation-boundary-demo";

import {
  createDelegationBoundaryToolActions
} from "../webmcp/delegationActions";

import {
  createDelegationToolDefinitions
} from "../webmcp/registerDelegationTools";

import type {
  DelegationWorkspace
} from "./types";

function clone<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
}

function addReviewableChallenge(
  workspace: DelegationWorkspace
): DelegationWorkspace {
  return createEditedRevision(
    workspace,
    "AGENT",
    "Agent challenged the current boundary",

    (revision) => {
      revision.challenges.push({
        id:
          `challenge-r${revision.version}-reviewable`,

        title:
          "Should a medium-impact standard decision remain under human review?",

        scenario: {
          evidence_quality:
            "HIGH",

          impact:
            "MEDIUM",

          reversibility:
            "REVERSIBLE",

          policy_clarity:
            "CLEAR",

          exceptionality:
            "STANDARD"
        },

        whyItMatters:
          "A wider autonomy boundary could move a materially different decision class out of human review.",

        suggestedOutcome:
          "HUMAN_REVIEW",

        status:
          "OPEN"
      });
    },

    "2026-08-29T18:00:00.000Z"
  );
}

describe(
  "mandatory challenge trust flow",
  () => {
    it(
      "never treats zero challenges as ready for decision",
      () => {
        const workspace =
          createInteractiveDelegationWorkspace();

        const current =
          getCurrentRevision(
            workspace
          );

        const reviewed =
          reviewRevision(
            current,
            workspace.factors
          );

        expect(
          reviewed.status
        ).toBe(
          "NEEDS_REVIEW"
        );

        expect(
          reviewed.review
            ?.challengeCount
        ).toBe(0);

        expect(
          reviewed.review
            ?.challengeSatisfied
        ).toBe(false);

        expect(
          reviewed.review
            ?.unresolvedChallengeIds
        ).toHaveLength(0);
      }
    );

    it(
      "removes stale challenges whenever the boundary changes while preserving human decisions",
      () => {
        let workspace =
          clone(
            delegationBoundaryDemoWorkspace
          );

        const original =
          getCurrentRevision(
            workspace
          );

        expect(
          original.challenges
        ).toHaveLength(3);

        expect(
          original.knownDecisions
        ).toHaveLength(3);

        const oldRevisionId =
          original.id;

        workspace =
          editBoundaryConditionAsHuman(
            workspace,
            "rule-agent-standard",
            "evidence_quality",
            "MEDIUM"
          );

        const current =
          getCurrentRevision(
            workspace
          );

        expect(
          current.challenges
        ).toHaveLength(0);

        expect(
          current.knownDecisions
        ).toHaveLength(3);

        const historical =
          workspace.revisions.find(
            (revision) =>
              revision.id ===
              oldRevisionId
          );

        expect(
          historical?.challenges
        ).toHaveLength(3);
      }
    );

    it(
      "turns a resolved challenge into a durable known decision and then becomes ready",
      () => {
        let workspace =
          createInteractiveDelegationWorkspace();

        expect(
          getCurrentRevision(
            workspace
          ).knownDecisions
        ).toHaveLength(0);

        workspace =
          addReviewableChallenge(
            workspace
          );

        workspace =
          resolveChallengeAsHuman(
            workspace,
            getCurrentRevision(
              workspace
            ).challenges[0].id,
            "HUMAN_REVIEW",
            "Medium-impact decisions still require human review."
          );

        const current =
          getCurrentRevision(
            workspace
          );

        expect(
          current.knownDecisions
        ).toHaveLength(1);

        expect(
          current.challenges
            .every(
              (challenge) =>
                challenge.status ===
                "RESOLVED"
            )
        ).toBe(true);

        const reviewed =
          reviewRevision(
            current,
            workspace.factors
          );

        expect(
          reviewed.status
        ).toBe(
          "READY_FOR_DECISION"
        );

        expect(
          reviewed.review
            ?.challengeSatisfied
        ).toBe(true);
      }
    );

    it(
      "requires a fresh challenge after a boundary edit even if the previous revision was fully challenged",
      () => {
        let workspace =
          createInteractiveDelegationWorkspace();

        workspace =
          addReviewableChallenge(
            workspace
          );

        workspace =
          resolveChallengeAsHuman(
            workspace,
            getCurrentRevision(
              workspace
            ).challenges[0].id,
            "HUMAN_REVIEW",
            "Medium impact stays under human review."
          );

        let current =
          getCurrentRevision(
            workspace
          );

        let reviewed =
          reviewRevision(
            current,
            workspace.factors
          );

        expect(
          reviewed.status
        ).toBe(
          "READY_FOR_DECISION"
        );

        workspace = {
          ...workspace,

          revisions:
            workspace.revisions.map(
              (revision) =>
                revision.id ===
                reviewed.id
                  ? reviewed
                  : revision
            )
        };

        workspace =
          editBoundaryConditionAsHuman(
            workspace,
            "rule-agent-standard",
            "evidence_quality",
            "MEDIUM"
          );

        current =
          getCurrentRevision(
            workspace
          );

        expect(
          current.challenges
        ).toHaveLength(0);

        reviewed =
          reviewRevision(
            current,
            workspace.factors
          );

        expect(
          reviewed.status
        ).toBe(
          "NEEDS_REVIEW"
        );

        expect(
          reviewed.review
            ?.challengeSatisfied
        ).toBe(false);
      }
    );

    it(
      "rejects an incomplete Agent Challenge scenario",
      async () => {
        let workspace =
          createInteractiveDelegationWorkspace();

        workspace =
          scopeDelegationTaskAsHuman(
            workspace,
            "Customer decision review",
            "Evaluate which routine customer decisions may be completed by an AI agent."
          );

        const actions =
          createDelegationBoundaryToolActions(
            () => workspace,

            (next) => {
              workspace = next;
            }
          );

        const tool =
          createDelegationToolDefinitions(
            actions
          ).find(
            (candidate) =>
              candidate.name ===
              "challenge_boundary_revision"
          )!;

        const before =
          workspace.revisions.length;

        const result =
          await tool.execute({
            title:
              "Incomplete challenge",

            scenario: {
              impact:
                "HIGH"
            },

            why_it_matters:
              "This deliberately omits required factors."
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
          workspace.revisions.length
        ).toBe(
          before
        );
      }
    );

    it(
      "rejects duplicate challenge scenarios for the same current boundary",
      async () => {
        let workspace =
          createInteractiveDelegationWorkspace();

        workspace =
          scopeDelegationTaskAsHuman(
            workspace,
            "Customer decision review",
            "Evaluate which routine customer decisions may be completed by an AI agent."
          );

        const actions =
          createDelegationBoundaryToolActions(
            () => workspace,

            (next) => {
              workspace = next;
            }
          );

        const tool =
          createDelegationToolDefinitions(
            actions
          ).find(
            (candidate) =>
              candidate.name ===
              "challenge_boundary_revision"
          )!;

        const input = {
          title:
            "Medium-impact challenge",

          scenario: {
            evidence_quality:
              "HIGH",

            impact:
              "MEDIUM",

            reversibility:
              "REVERSIBLE",

            policy_clarity:
              "CLEAR",

            exceptionality:
              "STANDARD"
          },

          why_it_matters:
            "Medium impact may still justify human review.",

          suggested_outcome:
            "HUMAN_REVIEW"
        };

        const first =
          await tool.execute(
            input
          );

        expect(
          (
            first as
              Record<
                string,
                unknown
              >
          ).status
        ).toBe(
          "success"
        );

        const revisionCount =
          workspace.revisions.length;

        const second =
          await tool.execute(
            input
          );

        expect(
          (
            second as
              Record<
                string,
                unknown
              >
          ).status
        ).toBe(
          "error"
        );

        expect(
          workspace.revisions.length
        ).toBe(
          revisionCount
        );
      }
    );
  }
);
