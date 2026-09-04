/**
 * ============================================================================
 *  THE HEART OF HITCH
 * ============================================================================
 *
 *  Projection: turning a capability the user owns, discovered over MCP, into a
 *  live WebMCP tool on this page.
 *
 *      MCP tool contract                 WebMCP tool contract
 *      -----------------                 --------------------
 *      name                       ->     name
 *      title                      ->     title
 *      description                ->     description
 *      inputSchema (JSON Schema)  ->     inputSchema (JSON Schema, verbatim)
 *      annotations.readOnlyHint   ->     annotations.readOnlyHint
 *      (server-side execution)    ->     execute() -> POST /api/execute -> MCP
 *
 *  Two things make this a capability layer rather than a protocol adapter:
 *
 *  1. A capability is only projected after the user explicitly grants it.
 *     Discovery is not permission. Nothing reaches `registerTool` on its own.
 *
 *  2. Every grant is held by an AbortController. Aborting the signal
 *     unregisters the tool, so a grant is a lease the user can end at any
 *     moment, not a flag some other code path has to remember to undo.
 *
 *  The `execute` closure never sees an MCP endpoint or a token. It posts a
 *  capability name to our own origin and lets the bridge do the privileged
 *  part.
 * ============================================================================
 */
import type { Capability } from "../../types/capability";
import { executeCapability } from "../api";
import { audit } from "../audit/events";
import { getModelContext } from "./support";

/** The response shape WebMCP requires from `execute`. */
export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

/**
 * Render a capability result as a WebMCP tool response.
 *
 * Text results are passed through as prose. Anything structured is serialised
 * into the text block (so every agent can read it) and also attached as
 * `structuredContent` for agents that understand it.
 */
export function toToolResponse(value: unknown): ToolResponse {
  if (typeof value === "string") {
    return { content: [{ type: "text", text: value }] };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

interface Lease {
  /** Aborting this is what unregisters the tool. */
  controller: AbortController;
  /** False when WebMCP is absent: the lease exists and is executable, but no
   *  agent-visible tool was registered. The UI says so rather than pretending. */
  registered: boolean;
  /** The exact closure handed to WebMCP. Kept so the UI's test call can
   *  exercise the real registered path instead of a parallel one. */
  execute: (input: any) => Promise<unknown>;
}

/** One live lease per projected capability. */
const leases = new Map<string, Lease>();

/** Optional hook so the UI can reflect execution state without polling. */
type ExecutionHook = (name: string, phase: "start" | "success" | "error") => void;
let onExecution: ExecutionHook = () => {};
export function setExecutionHook(hook: ExecutionHook) {
  onExecution = hook;
}

export function isProjected(name: string): boolean {
  return leases.has(name);
}

export function projectedNames(): string[] {
  return [...leases.keys()];
}

/** True when the grant actually reached `registerTool`. */
export function isRegistered(name: string): boolean {
  return leases.get(name)?.registered === true;
}

/**
 * Build the function the browser agent will call.
 *
 * This is the only path from agent to capability, and every step of it is
 * written to the audit log before and after the call.
 */
function buildExecutor(capability: Capability) {
  return async (input: any): Promise<ToolResponse> => {
    const startedAt = performance.now();

    audit({
      tool: capability.name,
      source: capability.source.label,
      stage: "requested",
      risk: capability.risk,
    });
    onExecution(capability.name, "start");

    try {
      const result = await executeCapability(
        capability.source.id,
        capability.name,
        (input ?? {}) as Record<string, unknown>,
      );

      if (!result.ok) {
        // A capability can fail two ways: the bridge could not reach it
        // (`error`), or it ran and reported a problem (`text`, from the MCP
        // error content). Either way the source's own words are the useful
        // ones, so pass them through rather than a generic message.
        throw new Error(
          result.error ?? result.text ?? "The capability returned an error.",
        );
      }

      audit({
        tool: capability.name,
        source: capability.source.label,
        stage: "completed",
        risk: capability.risk,
        durationMs: Math.round(performance.now() - startedAt),
      });
      onExecution(capability.name, "success");

      // WebMCP requires a content-block response, the same shape MCP itself
      // uses. Returning a bare string here is the kind of thing that works in
      // a lenient host and fails in a conforming one.
      return toToolResponse(result.data ?? result.text ?? result.raw ?? null);
    } catch (error: any) {
      audit({
        tool: capability.name,
        source: capability.source.label,
        stage: "failed",
        risk: capability.risk,
        durationMs: Math.round(performance.now() - startedAt),
        detail: error?.message ?? String(error),
      });
      onExecution(capability.name, "error");
      throw error;
    }
  };
}

/**
 * Grant one capability to the current WebMCP context.
 */
export async function projectCapability(capability: Capability): Promise<void> {
  if (leases.has(capability.name)) return;

  const controller = new AbortController();
  const execute = buildExecutor(capability);
  const modelContext = getModelContext();

  // No WebMCP in this browser: hold the lease anyway so the user can still
  // exercise the capability from the page, but do not claim an agent can see
  // it. `registered` stays false and the UI reports the difference.
  if (!modelContext) {
    leases.set(capability.name, { controller, execute, registered: false });
    audit({
      tool: capability.name,
      source: capability.source.label,
      stage: "granted",
      risk: capability.risk,
      detail: "Lease held locally. WebMCP is unavailable, so no agent-visible tool was registered.",
    });
    return;
  }

  // The properties the specification documents. Every conforming host accepts
  // exactly this.
  const core = {
    name: capability.name,
    // The source's JSON Schema is passed through untouched. The agent sees
    // exactly the contract the capability actually publishes.
    inputSchema: capability.inputSchema,
    description: capability.description,
    execute,
  };

  // Additions that carry the capability's risk profile through to the agent.
  // They are part of the MCP tool shape and are accepted by hosts that support
  // them, but a strict host may reject an unknown key, and losing the tool
  // entirely would be a far worse outcome than losing a hint.
  const enriched = {
    ...core,
    title: capability.title,
    annotations: {
      readOnlyHint: capability.risk === "read",
      destructiveHint: capability.risk === "dangerous",
      // Results come from a third-party capability source, so their content
      // is data to show the user, never instructions to follow.
      untrustedContentHint: true,
    },
  };

  try {
    await modelContext.registerTool(enriched, { signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw error;
    await modelContext.registerTool(core, { signal: controller.signal });
  }

  leases.set(capability.name, { controller, execute, registered: true });

  audit({
    tool: capability.name,
    source: capability.source.label,
    stage: "granted",
    risk: capability.risk,
  });
}

/**
 * End a lease. Aborting the signal is what unregisters the tool, so the
 * capability stops existing for the agent the moment this runs.
 */
export function revokeCapability(capability: Capability): void {
  const lease = leases.get(capability.name);
  if (!lease) return;

  lease.controller.abort();
  leases.delete(capability.name);

  // Belt and braces for builds that also expose explicit removal.
  getModelContext()?.unregisterTool?.(capability.name);

  audit({
    tool: capability.name,
    source: capability.source.label,
    stage: "revoked",
    risk: capability.risk,
  });
}

/**
 * Run a granted capability through its real registered closure.
 *
 * The UI's test call uses this so that what a human triggers and what an agent
 * triggers are literally the same function. Nothing is bypassed, and a
 * capability that has not been granted cannot be invoked at all.
 */
export async function invokeProjected(name: string, input: unknown): Promise<unknown> {
  const lease = leases.get(name);
  if (!lease) throw new Error(`"${name}" is not currently granted.`);
  return lease.execute(input);
}

/**
 * Ask the browser what it currently believes is registered, so the UI can show
 * real WebMCP state rather than our own bookkeeping.
 */
export async function inspectRegisteredTools(): Promise<string[] | null> {
  const ctx = getModelContext();
  if (!ctx?.getTools) return null;
  try {
    const tools = (await ctx.getTools()) as any[];
    return tools.map((t) => t?.name).filter(Boolean);
  } catch {
    return null;
  }
}
