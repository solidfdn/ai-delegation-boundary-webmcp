import type {
  AgentChallenge,
  ConditionOperator,
  DecisionCondition,
  DecisionFacts,
  DelegationOutcome,
  DelegationRevision,
  DelegationWorkspace,
  FactorDefinition,
  FactorValue,
  GuardrailCheckResult,
  KnownDecision,
  RegressionCheckResult,
  RevisionActor,
  RevisionReview
} from "./types";

const outcomeStrength:
  Record<DelegationOutcome, number> = {
    AGENT_ONLY: 0,
    HUMAN_REVIEW: 1,
    DO_NOT_DELEGATE: 2
  };

function deepClone<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
}

function compareOrdered(
  actual: FactorValue,
  expected: FactorValue,
  factor: FactorDefinition | undefined
): number | null {
  if (
    typeof actual === "number" &&
    typeof expected === "number"
  ) {
    return actual - expected;
  }

  if (
    typeof actual === "string" &&
    typeof expected === "string" &&
    factor?.type === "ORDERED" &&
    factor.orderedValues
  ) {
    const actualIndex =
      factor.orderedValues.indexOf(actual);

    const expectedIndex =
      factor.orderedValues.indexOf(expected);

    if (
      actualIndex < 0 ||
      expectedIndex < 0
    ) {
      return null;
    }

    return actualIndex - expectedIndex;
  }

  return null;
}

function isEqual(
  left: FactorValue,
  right: FactorValue
) {
  return left === right;
}

function asArray(
  value:
    | FactorValue
    | FactorValue[]
    | undefined
): FactorValue[] {
  if (Array.isArray(value)) {
    return value;
  }

  return value === undefined
    ? []
    : [value];
}

export function conditionMatches(
  facts: DecisionFacts,
  condition: DecisionCondition,
  factors: FactorDefinition[]
): boolean {
  const actual =
    facts[condition.factorId];

  if (condition.operator === "IS_SET") {
    return (
      actual !== null &&
      actual !== undefined
    );
  }

  if (
    actual === null ||
    actual === undefined ||
    condition.value === undefined
  ) {
    return false;
  }

  const factor =
    factors.find(
      (item) =>
        item.id === condition.factorId
    );

  switch (
    condition.operator as ConditionOperator
  ) {
    case "EQ":
      return (
        !Array.isArray(condition.value) &&
        isEqual(
          actual,
          condition.value
        )
      );

    case "NEQ":
      return (
        !Array.isArray(condition.value) &&
        !isEqual(
          actual,
          condition.value
        )
      );

    case "IN":
      return asArray(
        condition.value
      ).some(
        (candidate) =>
          isEqual(actual, candidate)
      );

    case "NOT_IN":
      return !asArray(
        condition.value
      ).some(
        (candidate) =>
          isEqual(actual, candidate)
      );

    case "AT_LEAST": {
      if (Array.isArray(condition.value)) {
        return false;
      }

      const result =
        compareOrdered(
          actual,
          condition.value,
          factor
        );

      return result !== null && result >= 0;
    }

    case "AT_MOST": {
      if (Array.isArray(condition.value)) {
        return false;
      }

      const result =
        compareOrdered(
          actual,
          condition.value,
          factor
        );

      return result !== null && result <= 0;
    }

    default:
      return false;
  }
}

export function conditionsMatch(
  facts: DecisionFacts,
  conditions: DecisionCondition[],
  factors: FactorDefinition[]
): boolean {
  return conditions.every(
    (condition) =>
      conditionMatches(
        facts,
        condition,
        factors
      )
  );
}

export function evaluateBoundary(
  revision: DelegationRevision,
  facts: DecisionFacts,
  factors: FactorDefinition[]
): DelegationOutcome {
  const rules =
    [...revision.boundary.rules]
      .sort(
        (left, right) =>
          left.priority - right.priority
      );

  for (const rule of rules) {
    if (
      conditionsMatch(
        facts,
        rule.when,
        factors
      )
    ) {
      return rule.outcome;
    }
  }

  return revision.boundary.defaultOutcome;
}

export function checkGuardrails(
  revision: DelegationRevision,
  factors: FactorDefinition[]
): GuardrailCheckResult[] {
  const results:
    GuardrailCheckResult[] = [];

  for (const guardrail of revision.guardrails) {
    /*
     * Guardrails are checked against known decisions and
     * challenge scenarios that actually satisfy the guardrail.
     *
     * This intentionally avoids pretending that an arbitrary
     * synthetic matrix is ground truth.
     */
    const scenarios: DecisionFacts[] = [
      ...revision.knownDecisions.map(
        (item) => item.facts
      ),
      ...revision.challenges.map(
        (item) => item.scenario
      )
    ];

    for (const scenario of scenarios) {
      if (
        !conditionsMatch(
          scenario,
          guardrail.when,
          factors
        )
      ) {
        continue;
      }

      const actualOutcome =
        evaluateBoundary(
          revision,
          scenario,
          factors
        );

      results.push({
        guardrailId: guardrail.id,
        actualOutcome,
        requiredOutcome:
          guardrail.requiredOutcome,
        violated:
          outcomeStrength[actualOutcome] <
          outcomeStrength[
            guardrail.requiredOutcome
          ]
      });
    }
  }

  return results;
}

export function checkRegressions(
  revision: DelegationRevision,
  factors: FactorDefinition[]
): RegressionCheckResult[] {
  return revision.knownDecisions.map(
    (known: KnownDecision) => {
      const actualOutcome =
        evaluateBoundary(
          revision,
          known.facts,
          factors
        );

      return {
        knownDecisionId: known.id,
        expectedOutcome:
          known.expectedOutcome,
        actualOutcome,
        passed:
          actualOutcome ===
          known.expectedOutcome
      };
    }
  );
}

export function reviewRevision(
  revision: DelegationRevision,
  factors: FactorDefinition[],
  reviewedAt =
    new Date().toISOString()
): DelegationRevision {
  const guardrails =
    checkGuardrails(
      revision,
      factors
    );

  const regressions =
    checkRegressions(
      revision,
      factors
    );

  const unresolvedChallengeIds =
    revision.challenges
      .filter(
        (challenge: AgentChallenge) =>
          challenge.status === "OPEN"
      )
      .map(
        (challenge) =>
          challenge.id
      );

  const challengeCount =
    revision.challenges.length;

  /*
   * No challenge is not a clean result.
   * The revision must first be actively challenged,
   * and every raised challenge must be resolved by a human.
   */
  const challengeSatisfied =
    challengeCount > 0 &&
    unresolvedChallengeIds.length === 0;

  const review: RevisionReview = {
    guardrails,
    regressions,
    challengeCount,
    challengeSatisfied,
    unresolvedChallengeIds,
    reviewedAt
  };

  const blocked =
    guardrails.some(
      (result) => result.violated
    ) ||
    regressions.some(
      (result) => !result.passed
    );

  const status =
    blocked
      ? "BLOCKED"
      : !challengeSatisfied
        ? "NEEDS_REVIEW"
        : "READY_FOR_DECISION";

  return {
    ...deepClone(revision),
    review,
    status
  };
}

export function getCurrentRevision(
  workspace: DelegationWorkspace
): DelegationRevision {
  const revision =
    workspace.revisions.find(
      (item) =>
        item.id ===
        workspace.currentRevisionId
    );

  if (!revision) {
    throw new Error(
      "Current revision does not exist."
    );
  }

  return revision;
}

export function createRevision(
  workspace: DelegationWorkspace,
  createdBy: RevisionActor,
  changeSummary: string,
  createdAt =
    new Date().toISOString()
): DelegationWorkspace {
  const current =
    getCurrentRevision(workspace);

  const nextVersion =
    Math.max(
      ...workspace.revisions.map(
        (revision) =>
          revision.version
      )
    ) + 1;

  const nextId =
    `${workspace.id}-r${nextVersion}`;

  const nextRevision:
    DelegationRevision = {
      ...deepClone(current),

      id: nextId,
      version: nextVersion,
      parentRevisionId:
        current.id,

      createdBy,
      createdAt,
      changeSummary,

      review: undefined,
      status: "DRAFT"
    };

  const revisions =
    workspace.revisions.map(
      (revision) => {
        if (
          revision.id !== current.id ||
          revision.status === "APPLIED"
        ) {
          return revision;
        }

        return {
          ...revision,
          status:
            "SUPERSEDED" as const
        };
      }
    );

  return {
    ...deepClone(workspace),
    revisions: [
      ...revisions,
      nextRevision
    ],
    currentRevisionId: nextId,

    /*
     * Any change creates a new exact state.
     * Prior human approval cannot authorize it.
     */
    approval: undefined
  };
}

function stableStringify(
  value: unknown
): string {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value
      .map(stableStringify)
      .join(",")}]`;
  }

  const record =
    value as Record<string, unknown>;

  const body =
    Object.keys(record)
      .filter(
        (key) =>
          record[key] !== undefined
      )
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify(
            record[key]
          )}`
      )
      .join(",");

  return `{${body}}`;
}

async function sha256Hex(
  input: string
): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      "Web Crypto SHA-256 is unavailable."
    );
  }

  const bytes =
    new TextEncoder().encode(input);

  const digest =
    await globalThis.crypto.subtle.digest(
      "SHA-256",
      bytes
    );

  return Array
    .from(new Uint8Array(digest))
    .map(
      (byte) =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}

function approvalPayload(
  workspace: DelegationWorkspace,
  revision: DelegationRevision
) {
  return {
    workspaceId: workspace.id,
    task: workspace.task,
    factors: workspace.factors,

    revision: {
      id: revision.id,
      version: revision.version,
      parentRevisionId:
        revision.parentRevisionId,

      boundary: revision.boundary,
      guardrails: revision.guardrails,
      knownDecisions:
        revision.knownDecisions,
      challenges:
        revision.challenges,

      /*
       * The review result is part of the exact
       * human-approved state.
       */
      review: revision.review
    }
  };
}

export async function
computeRevisionFingerprint(
  workspace: DelegationWorkspace,
  revisionId =
    workspace.currentRevisionId
): Promise<string> {
  const revision =
    workspace.revisions.find(
      (item) =>
        item.id === revisionId
    );

  if (!revision) {
    throw new Error(
      `Revision "${revisionId}" does not exist.`
    );
  }

  return sha256Hex(
    stableStringify(
      approvalPayload(
        workspace,
        revision
      )
    )
  );
}

export async function approveCurrentRevision(
  workspace: DelegationWorkspace,
  approvedAt =
    new Date().toISOString()
): Promise<DelegationWorkspace> {
  const current =
    getCurrentRevision(workspace);

  if (
    current.status !==
    "READY_FOR_DECISION"
  ) {
    throw new Error(
      "Only a revision that is READY_FOR_DECISION can be approved."
    );
  }

  const fingerprint =
    await computeRevisionFingerprint(
      workspace,
      current.id
    );

  return {
    ...deepClone(workspace),

    revisions:
      workspace.revisions.map(
        (revision) =>
          revision.id === current.id
            ? {
                ...revision,
                status:
                  "APPROVED" as const
              }
            : revision
      ),

    approval: {
      revisionId: current.id,
      fingerprint,
      approvedAt,
      approvedBy: "HUMAN"
    }
  };
}

export async function applyApprovedRevision(
  workspace: DelegationWorkspace,
  appliedAt =
    new Date().toISOString()
): Promise<DelegationWorkspace> {
  const approval =
    workspace.approval;

  if (!approval) {
    throw new Error(
      "No human-approved revision is available."
    );
  }

  if (
    approval.revisionId !==
    workspace.currentRevisionId
  ) {
    throw new Error(
      "Human approval does not match the current revision."
    );
  }

  const current =
    getCurrentRevision(workspace);

  if (
    current.status !== "APPROVED"
  ) {
    throw new Error(
      "The current revision is not approved."
    );
  }

  const currentFingerprint =
    await computeRevisionFingerprint(
      workspace,
      current.id
    );

  if (
    currentFingerprint !==
    approval.fingerprint
  ) {
    throw new Error(
      "Approved revision fingerprint no longer matches the current state."
    );
  }

  return {
    ...deepClone(workspace),

    revisions:
      workspace.revisions.map(
        (revision) =>
          revision.id === current.id
            ? {
                ...revision,
                status:
                  "APPLIED" as const
              }
            : revision
      ),

    application: {
      revisionId: current.id,
      fingerprint:
        currentFingerprint,
      appliedAt
    }
  };
}

/**
 * Create a new immutable revision from the current state,
 * apply one explicit edit, and invalidate any prior review
 * or human approval.
 *
 * Past revisions remain available as history.
 */
export function createEditedRevision(
  workspace: DelegationWorkspace,
  createdBy: RevisionActor,
  changeSummary: string,
  edit: (
    revision: DelegationRevision
  ) => void,
  createdAt =
    new Date().toISOString()
): DelegationWorkspace {
  const nextWorkspace =
    createRevision(
      workspace,
      createdBy,
      changeSummary,
      createdAt
    );

  const current =
    getCurrentRevision(
      nextWorkspace
    );

  const edited =
    deepClone(current);

  edit(edited);

  /*
   * Any edit makes prior review stale.
   */
  edited.review = undefined;
  edited.status = "DRAFT";

  return {
    ...nextWorkspace,

    revisions:
      nextWorkspace.revisions.map(
        (revision) =>
          revision.id === edited.id
            ? edited
            : revision
      ),

    approval: undefined
  };
}


/**
 * Create a revision whose delegation boundary has changed.
 *
 * Guardrails and Known Decisions remain durable.
 * Agent Challenges do not.
 *
 * A challenge tested the previous boundary state. Reusing it
 * after the boundary changes would create false assurance.
 */
export function createBoundaryRevision(
  workspace: DelegationWorkspace,
  createdBy: RevisionActor,
  changeSummary: string,
  edit: (
    revision: DelegationRevision
  ) => void,
  createdAt =
    new Date().toISOString()
): DelegationWorkspace {
  const next =
    createEditedRevision(
      workspace,
      createdBy,
      changeSummary,
      edit,
      createdAt
    );

  const current =
    getCurrentRevision(next);

  const reset =
    deepClone(current);

  /*
   * Preserve history in the superseded revision,
   * but make the new current boundary prove itself again.
   */
  reset.challenges = [];
  reset.review = undefined;
  reset.status = "DRAFT";

  return {
    ...next,

    revisions:
      next.revisions.map(
        (revision) =>
          revision.id === reset.id
            ? reset
            : revision
      ),

    approval: undefined
  };
}
