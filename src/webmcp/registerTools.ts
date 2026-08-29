import type { WorkspaceState } from "../core/types";

export function registerWorkspaceTool(
  getWorkspace: () => WorkspaceState,
  onAvailabilityChange: (available: boolean) => void
) {
  const context = document.modelContext;

  if (!context?.registerTool) {
    onAvailabilityChange(false);
    return () => {};
  }

  const controller = new AbortController();

  context.registerTool(
    {
      name: "inspect_workspace",
      title: "Inspect decision workspace",
      description:
        "Read the current observed case, agent decision, human correction, and precedent state before proposing any Decision Patch.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false
      },
      execute: async () => {
        return {
          status: "success",
          workspace: getWorkspace()
        };
      }
    },
    { signal: controller.signal }
  )
  .then(() => onAvailabilityChange(true))
  .catch(() => onAvailabilityChange(false));

  return () => controller.abort();
}
