import {
  applyApprovedRevision,
  createEditedRevision,
  getCurrentRevision,
  reviewRevision
} from "../core/delegationEngine";

import type {
  AgentChallenge,
  BoundaryRule,
  DecisionCondition,
  DecisionFacts,
  DelegationOutcome,
  DelegationRevision,
  DelegationWorkspace,
  FactorDefinition,
  FactorValue
} from "../core/types";

export interface BoundaryRevisionInput {
  operation:
    | "UPSERT"
    | "REMOVE";

  changeSummary: string;
  ruleId: string;

  label?: string;
  priority?: number;
  outcome?: DelegationOutcome;
  rationale?: string;
  when?: DecisionCondition[];
}

export interface AddChallengeInput {
  title: string;
  scenario: DecisionFacts;
  whyItMatters: string;
  suggestedOutcome?: DelegationOutcome;
}

export interface DelegationBoundaryToolActions {
  inspectWorkspace: () => unknown;

  proposeBoundaryRevision: (
    input: BoundaryRevisionInput
  ) => unknown;

  addChallenge: (
    input: AddChallengeInput
  ) => unknown;

  reviewCurrentRevision: () => unknown;

  inspectRevisionHistory: () => unknown;

  applyApprovedRevision: () =>
    Promise<unknown>;
}

type GetWorkspace =
  () => DelegationWorkspace;

type SetWorkspace =
  (workspace: DelegationWorkspace) => void;

function clone<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
}

function summarizeRevision(
  revision: DelegationRevision
) {
  return {
    id: revision.id,
    version: revision.version,
    parent_revision_id:
      revision.parentRevisionId,
    created_by:
      revision.createdBy,
    created_at:
      revision.createdAt,
    change_summary:
      revision.changeSummary,
    status:
      revision.status,

    boundary: revision.boundary,

    guardrails:
      revision.guardrails,

    known_decisions:
      revision.knownDecisions,

    challenges:
      revision.challenges,

    review:
      revision.review
  };
}

function validValueForFactor(
  value: FactorValue,
  factor: FactorDefinition
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

function validateCondition(
  condition: DecisionCondition,
  factors: FactorDefinition[]
): string | null {
  const factor =
    factors.find(
      (candidate) =>
        candidate.id ===
        condition.factorId
    );

  if (!factor) {
    return (
      `Unknown factor "${condition.factorId}".`
    );
  }

  const orderedOperators = [
    "AT_LEAST",
    "AT_MOST"
  ];

  if (
    orderedOperators.includes(
      condition.operator
    ) &&
    factor.type !== "ORDERED" &&
    factor.type !== "NUMBER"
  ) {
    return (
      `Operator "${condition.operator}" is not valid for factor "${condition.factorId}".`
    );
  }

  if (
    condition.operator === "IS_SET"
  ) {
    return null;
  }

  if (
    condition.value === undefined
  ) {
    return (
      `Condition "${condition.factorId}" requires a value.`
    );
  }

  const values =
    Array.isArray(
      condition.value
    )
      ? condition.value
      : [condition.value];

  if (
    values.length === 0
  ) {
    return (
      `Condition "${condition.factorId}" has no values.`
    );
  }

  for (const value of values) {
    if (
      !validValueForFactor(
        value,
        factor
      )
    ) {
      return (
        `Invalid value for factor "${condition.factorId}".`
      );
    }
  }

  return null;
}

function validateConditions(
  conditions: DecisionCondition[],
  factors: FactorDefinition[]
): string | null {
  if (
    conditions.length > 12
  ) {
    return (
      "A single rule may contain at most 12 conditions."
    );
  }

  for (
    const condition of conditions
  ) {
    const error =
      validateCondition(
        condition,
        factors
      );

    if (error) {
      return error;
    }
  }

  return null;
}

function validateScenario(
  scenario: DecisionFacts,
  factors: FactorDefinition[]
): string | null {
  const factorIds =
    new Set(
      factors.map(
        (factor) => factor.id
      )
    );

  for (
    const [key, value] of
    Object.entries(scenario)
  ) {
    if (!factorIds.has(key)) {
      return (
        `Unknown scenario factor "${key}".`
      );
    }

    if (value === null) {
      continue;
    }

    const factor =
      factors.find(
        (candidate) =>
          candidate.id === key
      );

    if (
      !factor ||
      !validValueForFactor(
        value,
        factor
      )
    ) {
      return (
        `Invalid scenario value for factor "${key}".`
      );
    }
  }

  return null;
}

function buildRule(
  input: BoundaryRevisionInput,
  existing:
    | BoundaryRule
    | undefined,
  factors: FactorDefinition[]
): BoundaryRule {
  const when =
    input.when ??
    existing?.when;

  const label =
    input.label ??
    existing?.label;

  const priority =
    input.priority ??
    existing?.priority;

  const outcome =
    input.outcome ??
    existing?.outcome;

  const rationale =
    input.rationale ??
    existing?.rationale;

  if (!label) {
    throw new Error(
      "label is required when creating a new rule."
    );
  }

  if (
    priority === undefined ||
    !Number.isFinite(priority)
  ) {
    throw new Error(
      "A finite priority is required."
    );
  }

  if (!outcome) {
    throw new Error(
      "outcome is required."
    );
  }

  if (!when) {
    throw new Error(
      "when conditions are required."
    );
  }

  const conditionError =
    validateConditions(
      when,
      factors
    );

  if (conditionError) {
    throw new Error(
      conditionError
    );
  }

  return {
    id: input.ruleId,
    label,
    priority,
    outcome,
    rationale,
    when: clone(when)
  };
}

export function
createDelegationBoundaryToolActions(
  getWorkspace: GetWorkspace,
  setWorkspace: SetWorkspace,
  now: () => string =
    () => new Date().toISOString()
): DelegationBoundaryToolActions {
  return {
    inspectWorkspace: () => {
      const workspace =
        getWorkspace();

      const current =
        getCurrentRevision(
          workspace
        );

      return {
        status: "success",

        product:
          "AI Delegation Boundary",

        purpose:
          "Decide where agent autonomy should end and human authority should begin.",

        task:
          workspace.task,

        factors:
          workspace.factors,

        current_revision:
          summarizeRevision(
            current
          ),

        revision_count:
          workspace.revisions.length,

        human_approval:
          workspace.approval
            ? {
                revision_id:
                  workspace
                    .approval
                    .revisionId,

                fingerprint:
                  workspace
                    .approval
                    .fingerprint,

                approved_at:
                  workspace
                    .approval
                    .approvedAt
              }
            : null,

        applied_revision:
          workspace.application
            ? {
                revision_id:
                  workspace
                    .application
                    .revisionId,

                fingerprint:
                  workspace
                    .application
                    .fingerprint,

                applied_at:
                  workspace
                    .application
                    .appliedAt
              }
            : null,

        authority_note:
          "No agent tool in the normal surface can create human approval."
      };
    },

    proposeBoundaryRevision: (
      input
    ) => {
      try {
        const workspace =
          getWorkspace();

        const current =
          getCurrentRevision(
            workspace
          );

        if (
          current.status ===
          "APPLIED"
        ) {
          /*
           * Starting new work from an applied
           * revision is allowed; the applied
           * revision remains historical.
           */
        }

        if (
          input.operation ===
          "REMOVE"
        ) {
          const existing =
            current.boundary.rules
              .find(
                (rule) =>
                  rule.id ===
                  input.ruleId
              );

          if (!existing) {
            return {
              status: "error",
              message:
                `Rule "${input.ruleId}" does not exist.`
            };
          }

          const next =
            createEditedRevision(
              workspace,
              "AGENT",
              input.changeSummary,
              (revision) => {
                revision
                  .boundary
                  .rules =
                    revision
                      .boundary
                      .rules
                      .filter(
                        (rule) =>
                          rule.id !==
                          input.ruleId
                      );
              },
              now()
            );

          setWorkspace(next);

          return {
            status: "success",
            action:
              "BOUNDARY_REVISION_CREATED",

            revision:
              summarizeRevision(
                getCurrentRevision(
                  next
                )
              ),

            human_approval:
              null,

            next_step:
              "Review this revision for guardrail violations, regressions, and unresolved challenges."
          };
        }

        const existing =
          current.boundary.rules
            .find(
              (rule) =>
                rule.id ===
                input.ruleId
            );

        const rule =
          buildRule(
            input,
            existing,
            workspace.factors
          );

        const next =
          createEditedRevision(
            workspace,
            "AGENT",
            input.changeSummary,
            (revision) => {
              const index =
                revision
                  .boundary
                  .rules
                  .findIndex(
                    (candidate) =>
                      candidate.id ===
                      rule.id
                  );

              if (index >= 0) {
                revision
                  .boundary
                  .rules[index] =
                    rule;
              } else {
                revision
                  .boundary
                  .rules.push(
                    rule
                  );
              }
            },
            now()
          );

        setWorkspace(next);

        return {
          status: "success",
          action:
            "BOUNDARY_REVISION_CREATED",

          revision:
            summarizeRevision(
              getCurrentRevision(
                next
              )
            ),

          protected_state: {
            guardrails_modified:
              false,
            known_decisions_modified:
              false
          },

          human_approval:
            null,

          next_step:
            "Review this revision and challenge it before any human approval."
        };
      } catch (error) {
        return {
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : String(error)
        };
      }
    },

    addChallenge: (
      input
    ) => {
      try {
        const workspace =
          getWorkspace();

        const scenarioError =
          validateScenario(
            input.scenario,
            workspace.factors
          );

        if (scenarioError) {
          return {
            status: "error",
            message:
              scenarioError
          };
        }

        const next =
          createEditedRevision(
            workspace,
            "AGENT",

            `Agent challenge: ${input.title}`,

            (revision) => {
              const challenge:
                AgentChallenge = {
                  id:
                    `challenge-r${revision.version}-${String(
                      revision
                        .challenges
                        .length + 1
                    ).padStart(
                      2,
                      "0"
                    )}`,

                  title:
                    input.title,

                  scenario:
                    clone(
                      input.scenario
                    ),

                  whyItMatters:
                    input
                      .whyItMatters,

                  suggestedOutcome:
                    input
                      .suggestedOutcome,

                  status:
                    "OPEN"
                };

              revision
                .challenges
                .push(
                  challenge
                );
            },

            now()
          );

        setWorkspace(next);

        return {
          status: "success",
          action:
            "CHALLENGE_ADDED",

          revision:
            summarizeRevision(
              getCurrentRevision(
                next
              )
            ),

          note:
            "Agent challenges are questions for human review, not ground truth."
        };
      } catch (error) {
        return {
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : String(error)
        };
      }
    },

    reviewCurrentRevision: () => {
      try {
        const workspace =
          getWorkspace();

        const current =
          getCurrentRevision(
            workspace
          );

        if (
          current.status ===
            "APPROVED" ||
          current.status ===
            "APPLIED"
        ) {
          return {
            status: "blocked",
            message:
              "An approved or applied revision is immutable. Create a new revision to continue."
          };
        }

        const reviewed =
          reviewRevision(
            current,
            workspace.factors,
            now()
          );

        const next: DelegationWorkspace = {
          ...workspace,

          revisions:
            workspace
              .revisions
              .map(
                (revision) =>
                  revision.id ===
                  reviewed.id
                    ? reviewed
                    : revision
              ),

          approval:
            undefined
        };

        setWorkspace(next);

        return {
          status: "success",
          action:
            "REVISION_REVIEWED",

          revision:
            summarizeRevision(
              reviewed
            ),

          decision_state:
            reviewed.status,

          interpretation:
            reviewed.status ===
            "BLOCKED"
              ? "The proposed authority change conflicts with a guardrail or a previously confirmed human decision."
              : reviewed.status ===
                "NEEDS_REVIEW"
                ? "No deterministic blocker was found, but one or more agent challenges still require human judgment."
                : "Configured checks are complete. This does not mean the revision is automatically safe; it is ready for a human decision."
        };
      } catch (error) {
        return {
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : String(error)
        };
      }
    },

    inspectRevisionHistory: () => {
      const workspace =
        getWorkspace();

      return {
        status: "success",

        current_revision_id:
          workspace
            .currentRevisionId,

        revisions:
          [...workspace.revisions]
            .sort(
              (left, right) =>
                right.version -
                left.version
            )
            .map(
              (revision) => ({
                id:
                  revision.id,

                version:
                  revision.version,

                parent_revision_id:
                  revision
                    .parentRevisionId,

                created_by:
                  revision.createdBy,

                created_at:
                  revision.createdAt,

                change_summary:
                  revision
                    .changeSummary,

                status:
                  revision.status,

                challenge_count:
                  revision
                    .challenges
                    .length,

                unresolved_challenges:
                  revision
                    .challenges
                    .filter(
                      (challenge) =>
                        challenge
                          .status ===
                        "OPEN"
                    )
                    .length,

                guardrail_violations:
                  revision
                    .review
                    ?.guardrails
                    .filter(
                      (result) =>
                        result
                          .violated
                    )
                    .length ??
                  null,

                regressions:
                  revision
                    .review
                    ?.regressions
                    .filter(
                      (result) =>
                        !result
                          .passed
                    )
                    .length ??
                  null
              }))
      };
    },

    applyApprovedRevision:
      async () => {
        try {
          const workspace =
            getWorkspace();

          const next =
            await applyApprovedRevision(
              workspace,
              now()
            );

          setWorkspace(next);

          const current =
            getCurrentRevision(
              next
            );

          return {
            status: "success",
            action:
              "APPROVED_REVISION_APPLIED",

            revision_id:
              current.id,

            version:
              current.version,

            fingerprint:
              next
                .application
                ?.fingerprint,

            applied_at:
              next
                .application
                ?.appliedAt,

            authorization:
              "The exact current revision matched an explicit human approval fingerprint."
          };
        } catch (error) {
          return {
            status: "blocked",
            message:
              error instanceof Error
                ? error.message
                : String(error)
          };
        }
      }
  };
}
