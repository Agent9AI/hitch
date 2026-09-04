/**
 * MCP client, the server side of the capability bridge.
 *
 * Everything in this file runs on the server. The MCP endpoint URLs and any
 * bearer tokens they need are read from environment bindings and are never
 * serialised to the browser. The page receives capability *contracts* only.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { harmonizeTool, wrapArguments, type HarmonizedTool } from "./harmonize";

export interface SourceConfig {
  /** Stable id used by the frontend and by /api/execute. */
  id: string;
  /** Product-facing name. */
  label: string;
  /** One line describing what this source holds. */
  blurb: string;
  url: string;
  token?: string;
}

export interface DiscoveredTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
}

/**
 * Opens a short-lived MCP session, runs `fn`, and always tears the session
 * down. Sessions are intentionally not pooled: a Worker isolate can vanish
 * between requests, and a stale MCP session is worse than a new one.
 */
async function withClient<T>(source: SourceConfig, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(
    { name: "hitch-capability-bridge", version: "0.1.0" },
    { capabilities: {} },
  );

  const headers: Record<string, string> = {};
  if (source.token) headers.authorization = `Bearer ${source.token}`;

  const transport = new StreamableHTTPClientTransport(new URL(source.url), {
    requestInit: { headers },
  });

  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

function toDiscovered(t: any): DiscoveredTool {
  return {
    name: t.name,
    title: t.title ?? t.annotations?.title,
    description: t.description,
    inputSchema: (t.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
    annotations: t.annotations,
  };
}

/**
 * MCP `tools/list` against one capability source, harmonised into clean
 * capability contracts. See ./harmonize.ts for what that means and why.
 */
export async function listTools(source: SourceConfig): Promise<HarmonizedTool[]> {
  return withClient(source, async (client) => {
    const result = await client.listTools();
    return (result.tools ?? []).map((t: any) => harmonizeTool(toDiscovered(t)));
  });
}

/**
 * MCP `tools/call`, gated by live discovery.
 *
 * The tool name is re-checked against a fresh `tools/list` on every call, so
 * the bridge can only ever invoke something the source is currently
 * advertising. A name the browser invents is rejected here, not at the source.
 */
export async function callTool(
  source: SourceConfig,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return withClient(source, async (client) => {
    const listed = await client.listTools();
    const match = (listed.tools ?? []).find((t: any) => t.name === name);
    if (!match) {
      throw new Error(`Capability "${name}" is not offered by source "${source.id}".`);
    }

    // Re-derive how this source wants its arguments, then absorb the quirk here
    // so the agent never had to know about it.
    const { wrapsArguments } = harmonizeTool(toDiscovered(match));
    return client.callTool({ name, arguments: wrapArguments(args, wrapsArguments) });
  });
}

/** Cheap liveness probe used to render source status in the UI. */
export async function probe(source: SourceConfig): Promise<{ online: boolean; error?: string }> {
  try {
    await listTools(source);
    return { online: true };
  } catch (err: any) {
    return { online: false, error: err?.message ?? String(err) };
  }
}
