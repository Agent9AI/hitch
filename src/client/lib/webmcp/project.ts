/**
 * ============================================================================
 *  THE HEART OF LOADOUT
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
  return async (input: any): Promise<string> => {
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

      if (!result.ok) throw new Error(result.error ?? "The capability returned an error.");

      audit({
        tool: capability.name,
        source: capability.source.label,
        stage: "completed",
        risk: capability.risk,
        durationMs: Math.round(performance.now() - startedAt),
      });
      onExecution(capability.name, "success");

      // Hand the agent the structured payload when the source gave us one,
      // otherwise the flattened text.
      return JSON.stringify(result.data ?? result.text ?? result.raw ?? null);
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

  await modelContext.registerTool(
    {
      name: capability.name,
      title: capability.title,
      description: capability.description,

      // The source's JSON Schema is passed through untouched. The agent sees
      // exactly the contract the capability actually publishes.
      inputSchema: capability.inputSchema,

      annotations: {
        readOnlyHint: capability.risk === "read",
        destructiveHint: capability.risk === "dangerous",
        // Results come from a third-party capability source, so their content
        // is data to show the user, never instructions to follow.
        untrustedContentHint: true,
      },

      execute,
    },
    { signal: controller.signal },
  );

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
export function inspectRegisteredTools(): string[] | null {
  const ctx = getModelContext();
  if (!ctx?.getTools) return null;
  try {
    const tools = ctx.getTools() as any[];
    return tools.map((t) => t?.name).filter(Boolean);
  } catch {
    return null;
  }
}
