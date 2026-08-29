import {
  createEditedRevision,
  getCurrentRevision
} from "./delegationEngine";

import type {
  DelegationOutcome,
  DelegationWorkspace,
  FactorDefinition,
  FactorValue
} from "./types";

function clone<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
}

function isAllowedValue(
  factor: FactorDefinition,
  value: FactorValue
): boolean {
  switch (factor.type) {
    case "BOOLEAN":
      return typeof value === "boolean";

    case "NUMBER":
      return (
        typeof value === "number" &&
        Number.isFinite(value)
      );

    case "ORDERED":
      return (
        typeof value === "string" &&
        Boolean(
          factor.orderedValues?.includes(
            value
          )
        )
      );

    case "CATEGORY":
      return (
        typeof value === "string" &&
        Boolean(
          factor.categories?.includes(
            value
          )
        )
      );

    default:
      return false;
  }
}

export function resolveChallengeAsHuman(
  workspace: DelegationWorkspace,
  challengeId: string,
  expectedOutcome: DelegationOutcome,
  note: string,
  createdAt =
    new Date().toISOString()
): DelegationWorkspace {
  const current =
    getCurrentRevision(workspace);

  const challenge =
    current.challenges.find(
      (candidate) =>
        candidate.id === challengeId
    );

  if (!challenge) {
    throw new Error(
      `Challenge "${challengeId}" does not exist.`
    );
  }

  if (
    challenge.status !== "OPEN"
  ) {
    throw new Error(
      `Challenge "${challengeId}" is already resolved.`
    );
  }

  return createEditedRevision(
    workspace,
    "HUMAN",

    `Human decided challenge: ${challenge.title}`,

    (revision) => {
      const target =
        revision.challenges.find(
          (candidate) =>
            candidate.id === challengeId
        );

      if (!target) {
        throw new Error(
          "Challenge disappeared while creating the revision."
        );
      }

      target.status =
        "RESOLVED";

      target.humanResolution = {
        decision:
          expectedOutcome ===
            "AGENT_ONLY"
            ? "ALLOW_AGENT"
            : expectedOutcome ===
              "DO_NOT_DELEGATE"
              ? "DO_NOT_DELEGATE"
              : "KEEP_HUMAN",

        note
      };

      /*
       * This is the key Decision Patch behavior:
       * a human judgment does not disappear into chat.
       * It becomes a regression test for future revisions.
       */
      revision.knownDecisions.push({
        id:
          `known-r${revision.version}-${challengeId}`,

        label:
          `Human decision: ${challenge.title}`,

        facts:
          clone(
            challenge.scenario
          ),

        expectedOutcome,

        rationale:
          note,

        createdInRevisionId:
          revision.id
      });
    },

    createdAt
  );
}

export function
editBoundaryConditionAsHuman(
  workspace: DelegationWorkspace,
  ruleId: string,
  factorId: string,
  nextValue: FactorValue,
  createdAt =
    new Date().toISOString()
): DelegationWorkspace {
  const current =
    getCurrentRevision(workspace);

  const rule =
    current.boundary.rules.find(
      (candidate) =>
        candidate.id === ruleId
    );

  if (!rule) {
    throw new Error(
      `Rule "${ruleId}" does not exist.`
    );
  }

  const condition =
    rule.when.find(
      (candidate) =>
        candidate.factorId === factorId
    );

  if (!condition) {
    throw new Error(
      `Rule "${ruleId}" does not contain factor "${factorId}".`
    );
  }

  const factor =
    workspace.factors.find(
      (candidate) =>
        candidate.id === factorId
    );

  if (!factor) {
    throw new Error(
      `Factor "${factorId}" does not exist.`
    );
  }

  if (
    !isAllowedValue(
      factor,
      nextValue
    )
  ) {
    throw new Error(
      `Invalid value for factor "${factorId}".`
    );
  }

  const before =
    condition.value;

  return createEditedRevision(
    workspace,
    "HUMAN",

    `Human changed ${factor.label}: ${String(
      before
    )} → ${String(nextValue)}`,

    (revision) => {
      const nextRule =
        revision.boundary.rules.find(
          (candidate) =>
            candidate.id === ruleId
        );

      const nextCondition =
        nextRule?.when.find(
          (candidate) =>
            candidate.factorId ===
            factorId
        );

      if (!nextCondition) {
        throw new Error(
          "Boundary condition disappeared while creating the revision."
        );
      }

      nextCondition.value =
        nextValue;
    },

    createdAt
  );
}
