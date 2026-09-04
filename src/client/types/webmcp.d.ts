/**
 * Minimal ambient types for the WebMCP imperative API.
 * Kept small on purpose: only what Loadout actually calls.
 */
export interface WebMCPToolDescriptor {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (input: any) => Promise<unknown>;
}

export interface ModelContext {
  registerTool(
    descriptor: WebMCPToolDescriptor,
    options?: { signal?: AbortSignal },
  ): Promise<{ unregister?: () => void } | void> | { unregister?: () => void } | void;
  unregisterTool?(name: string): void;
  getTools?(): unknown[];
  provideContext?(context: { tools: WebMCPToolDescriptor[] }): void;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
  interface Navigator {
    modelContext?: ModelContext;
  }
}
