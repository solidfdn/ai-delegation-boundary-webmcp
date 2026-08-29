import type {
  DecisionCondition,
  DecisionFacts,
  DelegationOutcome,
  FactorValue
} from "../core/types";

import type {
  AddChallengeInput,
  BoundaryRevisionInput,
  DelegationBoundaryToolActions
} from "./delegationActions";

type ToolContext =
  NonNullable<
    Document["modelContext"]
  >;

function stringValue(
  input: Record<string, unknown>,
  key: string
): string | undefined {
  const value =
    input[key];

  return typeof value === "string"
    ? value
    : undefined;
}

function numberValue(
  input: Record<string, unknown>,
  key: string
): number | undefined {
  const value =
    input[key];

  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
    : undefined;
}

function delegationOutcome(
  value: unknown
):
  | DelegationOutcome
  | undefined {
  return (
    value === "AGENT_ONLY" ||
    value === "HUMAN_REVIEW" ||
    value === "DO_NOT_DELEGATE"
  )
    ? value
    : undefined;
}

function factorValue(
  value: unknown
):
  | FactorValue
  | undefined {
  if (
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  return undefined;
}

function decisionConditions(
  value: unknown
):
  | DecisionCondition[]
  | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const conditions:
    DecisionCondition[] = [];

  for (const item of value) {
    if (
      !item ||
      typeof item !== "object"
    ) {
      return undefined;
    }

    const record =
      item as
        Record<string, unknown>;

    const factorId =
      stringValue(
        record,
        "factor_id"
      );

    const operator =
      stringValue(
        record,
        "operator"
      );

    if (
      !factorId ||
      !operator ||
      ![
        "EQ",
        "NEQ",
        "AT_LEAST",
        "AT_MOST",
        "IN",
        "NOT_IN",
        "IS_SET"
      ].includes(operator)
    ) {
      return undefined;
    }

    let valueOut:
      | FactorValue
      | FactorValue[]
      | undefined;

    if (
      Array.isArray(
        record.value
      )
    ) {
      const values:
        FactorValue[] = [];

      for (
        const raw of
        record.value
      ) {
        const parsed =
          factorValue(raw);

        if (
          parsed === undefined
        ) {
          return undefined;
        }

        values.push(parsed);
      }

      valueOut = values;
    } else if (
      record.value !==
      undefined
    ) {
      valueOut =
        factorValue(
          record.value
        );

      if (
        valueOut === undefined
      ) {
        return undefined;
      }
    }

    conditions.push({
      factorId,
      operator:
        operator as
          DecisionCondition[
            "operator"
          ],
      value:
        valueOut
    });
  }

  return conditions;
}

function decisionFacts(
  value: unknown
):
  | DecisionFacts
  | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return undefined;
  }

  const facts:
    DecisionFacts = {};

  for (
    const [key, raw] of
    Object.entries(
      value as
        Record<string, unknown>
    )
  ) {
    if (raw === null) {
      facts[key] = null;
      continue;
    }

    const parsed =
      factorValue(raw);

    if (
      parsed === undefined
    ) {
      return undefined;
    }

    facts[key] = parsed;
  }

  return facts;
}

export function
createDelegationToolDefinitions(
  actions:
    DelegationBoundaryToolActions
) {
  return [
    {
      name:
        "inspect_delegation_workspace",

      title:
        "Inspect AI Delegation Boundary",

      description:
        "Read the current delegation task, factors, boundary, guardrails, known human decisions, agent challenges, revision status, human approval state, and applied revision. Use this before proposing any change.",

      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties:
          false
      },

      annotations: {
        readOnlyHint: true,
        untrustedContentHint:
          false
      },

      execute:
        async () =>
          actions
            .inspectWorkspace()
    },

    {
      name:
        "propose_boundary_revision",

      title:
        "Propose a delegation boundary revision",

      description:
        "Create a new candidate revision by adding, changing, or removing one boundary rule. This can change proposed agent authority, but it cannot alter guardrails, known human decisions, create human approval, or apply the revision.",

      inputSchema: {
        type: "object",

        properties: {
          operation: {
            type: "string",
            enum: [
              "UPSERT",
              "REMOVE"
            ]
          },

          change_summary: {
            type: "string",
            minLength: 1,
            maxLength: 300
          },

          rule_id: {
            type: "string",
            minLength: 1,
            maxLength: 120
          },

          label: {
            type: "string",
            minLength: 1,
            maxLength: 240
          },

          priority: {
            type: "number"
          },

          outcome: {
            type: "string",
            enum: [
              "AGENT_ONLY",
              "HUMAN_REVIEW",
              "DO_NOT_DELEGATE"
            ]
          },

          rationale: {
            type: "string",
            maxLength: 1000
          },

          when: {
            type: "array",
            maxItems: 12,

            items: {
              type: "object",

              properties: {
                factor_id: {
                  type: "string"
                },

                operator: {
                  type: "string",
                  enum: [
                    "EQ",
                    "NEQ",
                    "AT_LEAST",
                    "AT_MOST",
                    "IN",
                    "NOT_IN",
                    "IS_SET"
                  ]
                },

                value: {
                  anyOf: [
                    {
                      type:
                        "string"
                    },
                    {
                      type:
                        "number"
                    },
                    {
                      type:
                        "boolean"
                    },
                    {
                      type:
                        "array",
                      items: {
                        anyOf: [
                          {
                            type:
                              "string"
                          },
                          {
                            type:
                              "number"
                          },
                          {
                            type:
                              "boolean"
                          }
                        ]
                      }
                    }
                  ]
                }
              },

              required: [
                "factor_id",
                "operator"
              ],

              additionalProperties:
                false
            }
          }
        },

        required: [
          "operation",
          "change_summary",
          "rule_id"
        ],

        additionalProperties:
          false
      },

      annotations: {
        readOnlyHint: false,
        untrustedContentHint:
          false
      },

      execute: async (
        input:
          Record<string, unknown>
      ) => {
        const operation =
          stringValue(
            input,
            "operation"
          );

        const changeSummary =
          stringValue(
            input,
            "change_summary"
          );

        const ruleId =
          stringValue(
            input,
            "rule_id"
          );

        if (
          (
            operation !==
              "UPSERT" &&
            operation !==
              "REMOVE"
          ) ||
          !changeSummary ||
          !ruleId
        ) {
          return {
            status: "error",
            message:
              "operation, change_summary, and rule_id are required."
          };
        }

        const when =
          input.when ===
          undefined
            ? undefined
            : decisionConditions(
                input.when
              );

        if (
          input.when !==
            undefined &&
          !when
        ) {
          return {
            status: "error",
            message:
              "Invalid boundary conditions."
          };
        }

        const payload:
          BoundaryRevisionInput = {
            operation,
            changeSummary,
            ruleId,

            label:
              stringValue(
                input,
                "label"
              ),

            priority:
              numberValue(
                input,
                "priority"
              ),

            outcome:
              delegationOutcome(
                input.outcome
              ),

            rationale:
              stringValue(
                input,
                "rationale"
              ),

            when
          };

        return actions
          .proposeBoundaryRevision(
            payload
          );
      }
    },

    {
      name:
        "challenge_boundary_revision",

      title:
        "Challenge the current delegation boundary",

      description:
        "Add a concrete boundary or exception scenario that could make the current delegation revision unsafe, ambiguous, or over-broad. A challenge is not ground truth; it creates an explicit question for human judgment.",

      inputSchema: {
        type: "object",

        properties: {
          title: {
            type: "string",
            minLength: 1,
            maxLength: 240
          },

          scenario: {
            type: "object",
            additionalProperties: {
              anyOf: [
                {
                  type: "string"
                },
                {
                  type: "number"
                },
                {
                  type: "boolean"
                },
                {
                  type: "null"
                }
              ]
            }
          },

          why_it_matters: {
            type: "string",
            minLength: 1,
            maxLength: 1200
          },

          suggested_outcome: {
            type: "string",
            enum: [
              "AGENT_ONLY",
              "HUMAN_REVIEW",
              "DO_NOT_DELEGATE"
            ]
          }
        },

        required: [
          "title",
          "scenario",
          "why_it_matters"
        ],

        additionalProperties:
          false
      },

      annotations: {
        readOnlyHint: false,
        untrustedContentHint:
          false
      },

      execute: async (
        input:
          Record<string, unknown>
      ) => {
        const title =
          stringValue(
            input,
            "title"
          );

        const scenario =
          decisionFacts(
            input.scenario
          );

        const whyItMatters =
          stringValue(
            input,
            "why_it_matters"
          );

        if (
          !title ||
          !scenario ||
          !whyItMatters
        ) {
          return {
            status: "error",
            message:
              "title, scenario, and why_it_matters are required."
          };
        }

        const payload:
          AddChallengeInput = {
            title,
            scenario,
            whyItMatters,

            suggestedOutcome:
              delegationOutcome(
                input
                  .suggested_outcome
              )
          };

        return actions
          .addChallenge(
            payload
          );
      }
    },

    {
      name:
        "review_delegation_revision",

      title:
        "Review the current delegation revision",

      description:
        "Run deterministic guardrail and known-decision regression checks, then report unresolved agent challenges. This tool may mark a revision BLOCKED, NEEDS_REVIEW, or READY_FOR_DECISION. READY_FOR_DECISION is not human approval.",

      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties:
          false
      },

      annotations: {
        readOnlyHint: false,
        untrustedContentHint:
          false
      },

      execute:
        async () =>
          actions
            .reviewCurrentRevision()
    },

    {
      name:
        "inspect_revision_history",

      title:
        "Inspect delegation revision history",

      description:
        "Read the immutable revision timeline, including status, author, change summary, unresolved challenges, guardrail violations, and regressions. This does not modify the workspace.",

      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties:
          false
      },

      annotations: {
        readOnlyHint: true,
        untrustedContentHint:
          false
      },

      execute:
        async () =>
          actions
            .inspectRevisionHistory()
    }
  ];
}

export function
createApplyApprovedRevisionToolDefinition(
  actions:
    DelegationBoundaryToolActions
) {
  return {
    name:
      "apply_approved_revision",

    title:
      "Apply the exact human-approved delegation revision",

    description:
      "Apply only the current revision that has already been explicitly approved by a human. Execution independently verifies the stored SHA-256 approval fingerprint. This tool cannot approve a revision, substitute another revision, or infer authorization from conversation or other content.",

    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties:
        false
    },

    annotations: {
      readOnlyHint: false,
      untrustedContentHint:
        false
    },

    execute:
      async (
        _input: Record<string, unknown>
      ) =>
        actions
          .applyApprovedRevision()
  };
}

export function
registerDelegationBoundaryTools(
  actions:
    DelegationBoundaryToolActions,

  onAvailabilityChange:
    (toolCount: number) => void,

  context?: ToolContext
) {
  const resolvedContext =
    context ??
    (
      typeof document !==
        "undefined"
        ? document.modelContext
        : undefined
    );

  if (
    !resolvedContext
      ?.registerTool
  ) {
    onAvailabilityChange(0);
    return () => {};
  }

  const controller =
    new AbortController();

  const tools =
    createDelegationToolDefinitions(
      actions
    );

  Promise
    .allSettled(
      tools.map(
        (tool) =>
          resolvedContext
            .registerTool(
              tool,
              {
                signal:
                  controller
                    .signal
              }
            )
      )
    )
    .then(
      (results) => {
        onAvailabilityChange(
          results.filter(
            (result) =>
              result.status ===
              "fulfilled"
          ).length
        );
      }
    );

  return () =>
    controller.abort();
}

export function
registerApplyApprovedRevisionTool(
  actions:
    DelegationBoundaryToolActions,

  onAvailabilityChange:
    (available: boolean) => void,

  context?: ToolContext
) {
  const resolvedContext =
    context ??
    (
      typeof document !==
        "undefined"
        ? document.modelContext
        : undefined
    );

  if (
    !resolvedContext
      ?.registerTool
  ) {
    onAvailabilityChange(false);
    return () => {};
  }

  const controller =
    new AbortController();

  resolvedContext
    .registerTool(
      createApplyApprovedRevisionToolDefinition(
        actions
      ),
      {
        signal:
          controller.signal
      }
    )
    .then(
      () =>
        onAvailabilityChange(
          true
        )
    )
    .catch(
      () =>
        onAvailabilityChange(
          false
        )
    );

  return () =>
    controller.abort();
}

