import type { ModelContext } from "../../types/webmcp";

/**
 * Resolve the WebMCP entry point.
 *
 * The spec draft puts it on `document.modelContext`. Some shipping builds
 * expose it on `navigator.modelContext`. Loadout accepts either rather than
 * failing on a browser that is genuinely WebMCP-capable.
 */
export function getModelContext(): ModelContext | undefined {
  if (typeof document !== "undefined" && (document as any).modelContext) {
    return (document as any).modelContext as ModelContext;
  }
  if (typeof navigator !== "undefined" && (navigator as any).modelContext) {
    return (navigator as any).modelContext as ModelContext;
  }
  return undefined;
}

export function isWebMCPSupported(): boolean {
  return getModelContext() !== undefined;
}

export function webmcpSurface(): string {
  if (typeof document !== "undefined" && (document as any).modelContext) return "document.modelContext";
  if (typeof navigator !== "undefined" && (navigator as any).modelContext) return "navigator.modelContext";
  return "unavailable";
}
