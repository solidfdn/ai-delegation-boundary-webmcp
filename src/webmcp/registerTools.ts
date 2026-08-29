import type {
  DecisionPatch,
  PatchConditions
} from "../core/types";

export interface DecisionPatchToolActions {
  inspectWorkspace: () => unknown;
  draftPatches: () => unknown;
  simulatePatch: (patchId: string) => unknown;
  comparePatches: (patchIds?: string[]) => unknown;
  revisePatch: (
    patchId: string,
    changes: Partial<PatchConditions>,
    clearConditions: string[]
  ) => unknown;
}

function asString(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "string" ? value : undefined;
}

function asStringArray(
  input: Record<string, unknown>,
  key: string
) {
  const value = input[key];

  if (!Array.isArray(value)) return undefined;

  return value.filter(
    (item): item is string => typeof item === "string"
  );
}

export function registerDecisionPatchTools(
  actions: DecisionPatchToolActions,
  onAvailabilityChange: (toolCount: number) => void
) {
  const context = document.modelContext;

  if (!context?.registerTool) {
    onAvailabilityChange(0);
    return () => {};
  }

  const controller = new AbortController();

  const tools = [
    {
      name: "inspect_workspace",
      title: "Inspect Decision Patch workspace",
      description:
        "Read the currently observed case, the agent's original decision, the human correction, candidate patches, simulations, and selected patch. Call this before deciding what to do next.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: true
      },
      execute: async () => actions.inspectWorkspace()
    },

    {
      name: "draft_decision_patches",
      title: "Draft candidate Decision Patches",
      description:
        "Turn the recorded human correction into Narrow, Balanced, and Broad candidate policy patches. This changes the shared page state but does not publish any rule.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false
      },
      execute: async () => actions.draftPatches()
    },

    {
      name: "simulate_patch",
      title: "Simulate one Decision Patch",
      description:
        "Evaluate one candidate patch against the complete synthetic evaluation matrix. Updates the shared page with affected decisions, reference alignment, counterexamples, and review transitions. Does not publish the patch.",
      inputSchema: {
        type: "object",
        properties: {
          patch_id: {
            type: "string",
            description:
              "Candidate patch ID, for example patch-narrow, patch-balanced, or patch-broad."
          }
        },
        required: ["patch_id"],
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false
      },
      execute: async (input: Record<string, unknown>) => {
        const patchId = asString(input, "patch_id");

        if (!patchId) {
          return {
            status: "error",
            message:
              "patch_id is required. Inspect the workspace to get available patch IDs."
          };
        }

        return actions.simulatePatch(patchId);
      }
    },

    {
      name: "compare_decision_patches",
      title: "Compare simulated Decision Patches",
      description:
        "Compare two or more already-simulated patches by changed decisions, reference alignment, counterexamples, and human-review transitions. Returns evidence for trade-off analysis; it does not choose or publish a patch.",
      inputSchema: {
        type: "object",
        properties: {
          patch_ids: {
            type: "array",
            items: {
              type: "string"
            },
            minItems: 2,
            maxItems: 3,
            description:
              "Optional patch IDs to compare. Omit to compare all candidate patches that already have simulation results."
          }
        },
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false
      },
      execute: async (input: Record<string, unknown>) =>
        actions.comparePatches(
          asStringArray(input, "patch_ids")
        )
    },

    {
      name: "revise_decision_patch",
      title: "Revise a candidate Decision Patch",
      description:
        "Change the generalization boundary of one candidate patch. A revised patch becomes stale and must be simulated again before comparison or publication.",
      inputSchema: {
        type: "object",
        properties: {
          patch_id: {
            type: "string",
            description: "Patch ID to revise."
          },
          urgency_at_least: {
            type: "string",
            enum: ["LOW", "MEDIUM", "HIGH"]
          },
          evidence_at_least: {
            type: "string",
            enum: ["WEAK", "PARTIAL", "STRONG"]
          },
          vulnerability_at_least: {
            type: "string",
            enum: ["LOW", "MEDIUM", "HIGH"]
          },
          potential_harm_at_most: {
            type: "string",
            enum: ["LOW", "MEDIUM", "HIGH"]
          },
          continuity_at_least: {
            type: "string",
            enum: ["LOW", "MEDIUM", "HIGH"]
          },
          clear_conditions: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "urgencyAtLeast",
                "evidenceAtLeast",
                "vulnerabilityAtLeast",
                "potentialHarmAtMost",
                "continuityAtLeast"
              ]
            },
            uniqueItems: true,
            description:
              "Optional existing conditions to remove before applying the supplied changes."
          }
        },
        required: ["patch_id"],
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false
      },
      execute: async (input: Record<string, unknown>) => {
        const patchId = asString(input, "patch_id");

        if (!patchId) {
          return {
            status: "error",
            message:
              "patch_id is required. Inspect the workspace to get available patch IDs."
          };
        }

        const changes: Partial<PatchConditions> = {};

        const urgency = asString(input, "urgency_at_least");
        const evidence = asString(input, "evidence_at_least");
        const vulnerability = asString(
          input,
          "vulnerability_at_least"
        );
        const harm = asString(
          input,
          "potential_harm_at_most"
        );
        const continuity = asString(
          input,
          "continuity_at_least"
        );

        if (
          urgency === "LOW" ||
          urgency === "MEDIUM" ||
          urgency === "HIGH"
        ) {
          changes.urgencyAtLeast = urgency;
        }

        if (
          evidence === "WEAK" ||
          evidence === "PARTIAL" ||
          evidence === "STRONG"
        ) {
          changes.evidenceAtLeast = evidence;
        }

        if (
          vulnerability === "LOW" ||
          vulnerability === "MEDIUM" ||
          vulnerability === "HIGH"
        ) {
          changes.vulnerabilityAtLeast = vulnerability;
        }

        if (
          harm === "LOW" ||
          harm === "MEDIUM" ||
          harm === "HIGH"
        ) {
          changes.potentialHarmAtMost = harm;
        }

        if (
          continuity === "LOW" ||
          continuity === "MEDIUM" ||
          continuity === "HIGH"
        ) {
          changes.continuityAtLeast = continuity;
        }

        return actions.revisePatch(
          patchId,
          changes,
          asStringArray(input, "clear_conditions") ?? []
        );
      }
    }
  ];

  Promise.allSettled(
    tools.map((tool) =>
      context.registerTool(tool, {
        signal: controller.signal
      })
    )
  ).then((results) => {
    const registered = results.filter(
      (result) => result.status === "fulfilled"
    ).length;

    onAvailabilityChange(registered);
  });

  return () => controller.abort();
}
