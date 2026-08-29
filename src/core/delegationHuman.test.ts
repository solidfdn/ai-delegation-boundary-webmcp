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
  resolveChallengeAsHuman
} from "./delegationHuman";

import {
  createInteractiveDelegationWorkspace
} from "../domains/interactive-delegation-workspace";

describe(
  "Human Delegation Boundary actions",
  () => {
    it(
      "turns a human challenge decision into a regression test",
      () => {
        let workspace =
          createInteractiveDelegationWorkspace();

        workspace =
          editBoundaryConditionAsHuman(
            workspace,
            "rule-agent-standard",
            "evidence_quality",
            "MEDIUM",
            "2026-08-29T14:00:00.000Z"
          );

        workspace =
          createEditedRevision(
            workspace,
            "AGENT",
            "Agent challenged medium evidence delegation",

            (revision) => {
              revision.challenges.push({
                id:
                  "challenge-medium-evidence",

                title:
                  "Should medium-quality evidence be enough for autonomous completion?",

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
                    "STANDARD"
                },

                whyItMatters:
                  "The proposed revision expands authority to decisions supported by weaker evidence.",

                suggestedOutcome:
                  "HUMAN_REVIEW",

                status:
                  "OPEN"
              });
            },

            "2026-08-29T15:00:00.000Z"
          );

        const beforeKnown =
          getCurrentRevision(
            workspace
          ).knownDecisions.length;

        workspace =
          resolveChallengeAsHuman(
            workspace,
            "challenge-medium-evidence",
            "HUMAN_REVIEW",
            "Medium-quality evidence still requires human review.",
            "2026-08-29T16:00:00.000Z"
          );

        const current =
          getCurrentRevision(
            workspace
          );

        expect(
          current.challenges.find(
            (challenge) =>
              challenge.id ===
              "challenge-medium-evidence"
          )?.status
        ).toBe(
          "RESOLVED"
        );

        expect(
          current.knownDecisions.length
        ).toBe(
          beforeKnown + 1
        );

        const reviewed =
          reviewRevision(
            current,
            workspace.factors,
            "2026-08-29T17:00:00.000Z"
          );

        /*
         * The unchanged MEDIUM boundary now conflicts
         * with the human's newly confirmed decision.
         */
        expect(
          reviewed.status
        ).toBe(
          "BLOCKED"
        );

        expect(
          reviewed.review?.regressions
            .some(
              (result) =>
                !result.passed
            )
        ).toBe(true);
      }
    );

    it(
      "creates a new immutable revision for every human boundary edit",
      () => {
        const original =
          createInteractiveDelegationWorkspace();

        const edited =
          editBoundaryConditionAsHuman(
            original,
            "rule-agent-standard",
            "evidence_quality",
            "MEDIUM"
          );

        expect(
          edited.revisions.length
        ).toBe(
          original.revisions.length + 1
        );

        expect(
          edited.currentRevisionId
        ).not.toBe(
          original.currentRevisionId
        );

        expect(
          getCurrentRevision(
            edited
          ).status
        ).toBe(
          "DRAFT"
        );

        expect(
          edited.approval
        ).toBeUndefined();

        const historical =
          edited.revisions.find(
            (revision) =>
              revision.id ===
              original.currentRevisionId
          );

        expect(
          historical?.status
        ).toBe(
          "SUPERSEDED"
        );
      }
    );
  }
);
