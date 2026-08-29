type ToolDefinition = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (
    input: Record<string, unknown>,
    client?: { signal?: AbortSignal }
  ) => unknown | Promise<unknown>;
};

interface ModelContext {
  registerTool(
    tool: ToolDefinition,
    options?: { signal?: AbortSignal }
  ): Promise<void>;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

export {};
