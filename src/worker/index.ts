/**
 * Hitch capability bridge (server).
 *
 * Two endpoints, and that is the whole server surface:
 *
 *   GET  /api/capabilities   discover capabilities from every configured source
 *   POST /api/execute        run one approved capability through MCP
 *
 * The bridge exists so the browser never holds an MCP endpoint, a bearer
 * token, a model key, or a database handle. It holds a capability name.
 */
import { listTools, callTool, probe, type SourceConfig } from "./mcp/client";
import { normalizeMcpResult } from "./mcp/normalize";
import { classifyRisk, type CapabilityRisk } from "./policy/risk";
import { guardSourceUrl, sanitizeToken } from "./policy/guard";

interface Env {
  ASSETS: Fetcher;
  LEASES: KVNamespace;
  MCP_CLOUD_URL?: string;
  MCP_N8N_URL?: string;
  MCP_N8N_TOKEN?: string;
}

/** How long a connection lease to a user-supplied source survives. */
const LEASE_TTL_SECONDS = 60 * 60;

const DEFAULT_CLOUD_URL = "https://hitch-capability-source.terry-c87.workers.dev/mcp";

/** Capability sources are server configuration. The browser learns their
 *  names, never their addresses or their tokens. */
function sources(env: Env): SourceConfig[] {
  const list: SourceConfig[] = [
    {
      id: "cloud",
      label: "Hitch Cloud Source",
      blurb: "A hosted MCP server holding a text-generation model and a task store.",
      url: env.MCP_CLOUD_URL || DEFAULT_CLOUD_URL,
    },
  ];

  if (env.MCP_N8N_URL) {
    list.push({
      id: "n8n",
      label: "n8n",
      blurb:
        "A self-hosted n8n instance. Hitch reaches it with a bearer token that never leaves the bridge.",
      url: env.MCP_N8N_URL,
      token: env.MCP_N8N_TOKEN,
    });
  }

  return list;
}

export interface Capability {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  risk: CapabilityRisk;
  source: { id: string; label: string; type: "mcp" };
}

function toCapability(t: any, source: { id: string; label: string }): Capability {
  return {
    name: t.name,
    title: t.title ?? t.name.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
    description: t.description ?? "No description provided by the source.",
    inputSchema: t.inputSchema,
    risk: classifyRisk(t.name, t.annotations),
    source: { id: source.id, label: source.label, type: "mcp" as const },
  };
}

/**
 * Resolve a lease handle back into a real capability source.
 *
 * The browser only ever holds the handle. The URL and token behind it live in
 * KV with a TTL, so a pasted MCP credential never enters the page, never
 * enters localStorage, and expires on its own.
 */
async function resolveLease(env: Env, sourceId: string): Promise<SourceConfig | null> {
  if (!sourceId.startsWith("byo:")) return null;
  const raw = await env.LEASES.get(`lease:${sourceId.slice(4)}`);
  if (!raw) return null;
  const stored = JSON.parse(raw) as { url: string; token?: string; label: string };
  return { id: sourceId, label: stored.label, blurb: "Connected by you.", url: stored.url, token: stored.token };
}

/**
 * POST /api/connect, attach a capability source the user owns.
 */
async function handleConnect(request: Request, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Request body must be JSON." }, 400);
  }

  const guard = guardSourceUrl(String(body?.url ?? ""));
  if (!guard.ok || !guard.url) return json({ ok: false, error: guard.error }, 400);

  const token = sanitizeToken(body?.token);
  const label = guard.url.hostname;

  // Prove the source is real and reachable before issuing a lease.
  const candidate: SourceConfig = {
    id: "pending",
    label,
    blurb: "Connected by you.",
    url: guard.url.toString(),
    token,
  };

  let tools;
  try {
    tools = await listTools(candidate);
  } catch (err: any) {
    return json({ ok: false, error: `Could not reach that MCP server: ${briefError(err)}` }, 502);
  }

  const handle = crypto.randomUUID().replace(/-/g, "");
  await env.LEASES.put(
    `lease:${handle}`,
    JSON.stringify({ url: guard.url.toString(), token, label }),
    { expirationTtl: LEASE_TTL_SECONDS },
  );

  const sourceId = `byo:${handle}`;
  return json({
    ok: true,
    source: {
      id: sourceId,
      label,
      blurb: `Your MCP server. Connection leased for ${LEASE_TTL_SECONDS / 60} minutes.`,
      online: true,
      count: tools.length,
    },
    capabilities: tools.map((t) => toCapability(t, { id: sourceId, label })),
    expiresInSeconds: LEASE_TTL_SECONDS,
  });
}

/** Remote sources can return anything, including a whole HTML page. Never echo
 *  more than a short, safe slice of it back to the browser. */
function briefError(err: any): string {
  const message = String(err?.message ?? err ?? "Unknown error").replace(/\s+/g, " ").trim();
  return message.length > 200 ? `${message.slice(0, 200)}\u2026` : message;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/* ---------------------------- discovery ---------------------------- */

async function handleCapabilities(env: Env): Promise<Response> {
  const configured = sources(env);

  const results = await Promise.all(
    configured.map(async (source) => {
      try {
        const tools = await listTools(source);
        const capabilities: Capability[] = tools.map((t) =>
          toCapability(t, { id: source.id, label: source.label }),
        );
        return {
          source: {
            id: source.id,
            label: source.label,
            blurb: source.blurb,
            online: true,
            count: capabilities.length,
          },
          capabilities,
        };
      } catch (err: any) {
        return {
          source: {
            id: source.id,
            label: source.label,
            blurb: source.blurb,
            online: false,
            count: 0,
            error: briefError(err),
          },
          capabilities: [] as Capability[],
        };
      }
    }),
  );

  return json({
    sources: results.map((r) => r.source),
    capabilities: results.flatMap((r) => r.capabilities),
    discoveredAt: new Date().toISOString(),
  });
}

/* ---------------------------- execution ---------------------------- */

async function handleExecute(request: Request, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Request body must be JSON." }, 400);
  }

  const sourceId = String(body?.source ?? "");
  const tool = String(body?.tool ?? "");
  const args = body?.arguments;

  if (!tool) return json({ ok: false, error: "`tool` is required." }, 400);
  if (args !== undefined && (typeof args !== "object" || args === null || Array.isArray(args))) {
    return json({ ok: false, error: "`arguments` must be a JSON object." }, 400);
  }

  const source =
    sources(env).find((s) => s.id === sourceId) ?? (await resolveLease(env, sourceId));
  if (!source) {
    return json(
      {
        ok: false,
        error: sourceId.startsWith("byo:")
          ? "That connection lease has expired. Reconnect your capability source."
          : `Unknown capability source "${sourceId}".`,
      },
      400,
    );
  }

  const startedAt = Date.now();
  try {
    const result = await callTool(source, tool, (args ?? {}) as Record<string, unknown>);
    const normalized = normalizeMcpResult(result);
    return json({
      ok: normalized.ok,
      tool,
      source: sourceId,
      durationMs: Date.now() - startedAt,
      data: normalized.data,
      text: normalized.text,
      raw: normalized.raw,
    });
  } catch (err: any) {
    return json(
      {
        ok: false,
        tool,
        source: sourceId,
        durationMs: Date.now() - startedAt,
        error: briefError(err),
      },
      502,
    );
  }
}

/* ------------------------------ router ----------------------------- */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/capabilities" && request.method === "GET") {
      return handleCapabilities(env);
    }

    if (url.pathname === "/api/connect" && request.method === "POST") {
      return handleConnect(request, env);
    }

    if (url.pathname === "/api/execute" && request.method === "POST") {
      return handleExecute(request, env);
    }

    if (url.pathname === "/api/health") {
      const probes = await Promise.all(
        sources(env).map(async (s) => ({ id: s.id, ...(await probe(s)) })),
      );
      return json({ ok: probes.some((p) => p.online), sources: probes });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "Not found" }, 404);
    }

    // Everything else is the single-page app.
    return env.ASSETS.fetch(request);
  },
};
