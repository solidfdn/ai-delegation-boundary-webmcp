import {
  describe,
  expect,
  it
} from "vitest";

import {
  createBoundaryRevision,
  createEditedRevision,
  getCurrentRevision,
  reviewRevision
} from "./delegationEngine";

import {
  resolveChallengeAsHuman,
  scopeDelegationTaskAsHuman
} from "./delegationHuman";

import {
  createInteractiveDelegationWorkspace
} from "../domains/interactive-delegation-workspace";

import type {
  DelegationWorkspace,
  FactorDefinition
} from "./types";

function addUnrelatedChallenge(
  workspace: DelegationWorkspace
): DelegationWorkspace {
  return createEditedRevision(
    workspace,
    "AGENT",
    "Agent challenged only a reversible case",

    (revision) => {
      revision.challenges.push({
        id:
          `challenge-r${revision.version}-reversible`,

        title:
          "Should a reversible medium-impact case stay under human review?",

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
          "This challenge deliberately does not exercise the irreversible guardrail.",

        suggestedOutcome:
          "HUMAN_REVIEW",

        status:
          "OPEN"
      });
    }
  );
}

describe(
  "Guardrails as invariants",
  () => {
    it(
      "finds a Guardrail violation even when the Agent never challenges the dangerous scenario",
      () => {
        let workspace =
          createInteractiveDelegationWorkspace();

        workspace =
          scopeDelegationTaskAsHuman(
            workspace,
            "Operational approval decisions",
            ""
          );

        /*
         * Deliberately create an unsafe boundary.
         *
         * Remove the explicit irreversible stop,
         * then remove reversibility from the autonomous rule.
         */
        workspace =
          createBoundaryRevision(
            workspace,
            "AGENT",
            "Unsafe widening of agent authority",

            (revision) => {
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

              agentRule.when =
                agentRule.when.filter(
                  (condition) =>
                    condition.factorId !==
                    "reversibility"
                );
            }
          );

        /*
         * Agent raises only a harmless reversible challenge.
         * Guardrail verification must still discover the
         * irreversible counterexample independently.
         */
        workspace =
          addUnrelatedChallenge(
            workspace
          );

        workspace =
          resolveChallengeAsHuman(
            workspace,
            getCurrentRevision(
              workspace
            ).challenges[0].id,
            "HUMAN_REVIEW",
            "Medium-impact reversible decisions remain reviewed."
          );

        const reviewed =
          reviewRevision(
            getCurrentRevision(
              workspace
            ),
            workspace.factors
          );

        expect(
          reviewed.status
        ).toBe(
          "BLOCKED"
        );

        const irreversible =
          reviewed.review
            ?.guardrails
            .find(
              (result) =>
                result.guardrailId ===
                "guardrail-irreversible"
            );

        expect(
          irreversible
            ?.violated
        ).toBe(true);

        expect(
          irreversible
            ?.witnessFacts
            ?.reversibility
        ).toBe(
          "IRREVERSIBLE"
        );
      }
    );

    it(
      "records complete invariant verification for the configured finite domain",
      () => {
        let workspace =
          createInteractiveDelegationWorkspace();

        workspace =
          scopeDelegationTaskAsHuman(
            workspace,
            "Operational approval decisions",
            ""
          );

        workspace =
          addUnrelatedChallenge(
            workspace
          );

        workspace =
          resolveChallengeAsHuman(
            workspace,
            getCurrentRevision(
              workspace
            ).challenges[0].id,
            "HUMAN_REVIEW",
            "Keep this case under human review."
          );

        const reviewed =
          reviewRevision(
            getCurrentRevision(
              workspace
            ),
            workspace.factors
          );

        expect(
          reviewed.review
            ?.guardrailVerificationComplete
        ).toBe(true);

        expect(
          reviewed.review
            ?.guardrailStatesChecked
        ).toBeGreaterThan(0);

        expect(
          reviewed.review
            ?.guardrailsChecked
        ).toBe(
          reviewed.guardrails.length
        );

        expect(
          reviewed.review
            ?.guardrails
            .every(
              (result) =>
                !result.violated
            )
        ).toBe(true);
      }
    );

    it(
      "refuses READY when the decision domain cannot be exhaustively verified",
      () => {
        let workspace =
          createInteractiveDelegationWorkspace();

        workspace =
          scopeDelegationTaskAsHuman(
            workspace,
            "Operational approval decisions",
            ""
          );

        const numeric:
          FactorDefinition = {
            id:
              "unbounded_amount",

            label:
              "Unbounded amount",

            type:
              "NUMBER"
          };

        workspace = {
          ...workspace,

          factors: [
            ...workspace.factors,
            numeric
          ]
        };

        const current =
          getCurrentRevision(
            workspace
          );

        current.challenges.push({
          id:
            "challenge-number-domain",

          title:
            "Numeric-domain challenge",

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
              "STANDARD",

            unbounded_amount:
              100
          },

          whyItMatters:
            "The numeric factor is intentionally unbounded.",

          status:
            "RESOLVED",

          humanResolution: {
            decision:
              "KEEP_HUMAN",

            note:
              "Human reviewed this case."
          }
        });

        const reviewed =
          reviewRevision(
            current,
            workspace.factors
          );

        expect(
          reviewed.review
            ?.guardrailVerificationComplete
        ).toBe(false);

        expect(
          reviewed.status
        ).toBe(
          "NEEDS_REVIEW"
        );
      }
    );
  }
);
