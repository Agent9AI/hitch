/**
 * Minimal ambient types for the WebMCP imperative API.
 * Kept small on purpose: only what Hitch actually calls.
 */
/** The response shape WebMCP requires from a tool's `execute`. */
export interface WebMCPToolResponse {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export interface WebMCPToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: any) => Promise<WebMCPToolResponse>;
  /** Not in the documented imperative API; sent opportunistically. */
  title?: string;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    untrustedContentHint?: boolean;
  };
}

export interface ModelContext {
  registerTool(
    descriptor: WebMCPToolDescriptor,
    options?: { signal?: AbortSignal },
  ): Promise<void>;
  getTools?(): Promise<Array<{ name: string; description?: string; origin?: string }>>;
  unregisterTool?(name: string): void;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
  interface Navigator {
    modelContext?: ModelContext;
  }
}
