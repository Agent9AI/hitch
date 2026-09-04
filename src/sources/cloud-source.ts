/**
 * Hitch Cloud Capability Source
 * ================================
 * A real, standalone MCP server speaking Streamable HTTP (2025-06-18).
 *
 * This deliberately runs as its OWN Cloudflare Worker on its OWN origin. It is
 * not part of the Hitch app. The Hitch capability bridge reaches it over the
 * public internet with the official MCP client, exactly as it reaches n8n.
 *
 * Why it exists: the n8n capability source is a self-hosted instance. This
 * source guarantees a judge always has at least one live, credential-holding
 * capability source to project into WebMCP.
 *
 * The credentials this source holds (Workers AI binding, KV namespace) are never
 * visible to the Hitch page or to the browser agent. They stay here.
 */

interface Env {
  AI: { run(model: string, input: unknown): Promise<any> };
  TASKS: KVNamespace;
}

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

/* ------------------------------------------------------------------ *
 * Tool definitions (MCP `tools/list` payload)
 * ------------------------------------------------------------------ */

const TOOLS = [
  {
    name: "research_company",
    title: "Research Company",
    description:
      "Research an organization and return a concise factual summary with key points. Use this when the user needs background information about a company, project, or organization before writing or deciding something.",
    inputSchema: {
      type: "object",
      properties: {
        company: {
          type: "string",
          description: "Name of the company or organization to research.",
        },
      },
      required: ["company"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "draft_launch_announcement",
    title: "Draft Launch Announcement",
    description:
      "Draft a short launch announcement for a subject, tuned to a target audience and tone. Returns a headline and body copy. Use this when the user asks for launch, release, or announcement copy.",
    inputSchema: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description: "What is being launched or announced.",
        },
        audience: {
          type: "string",
          description:
            "Who the announcement is for, e.g. 'developers', 'existing customers', 'press'.",
        },
        tone: {
          type: "string",
          description:
            "Desired tone, e.g. 'confident', 'technical', 'friendly'. Defaults to 'confident'.",
        },
      },
      required: ["subject", "audience"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, openWorldHint: false },
  },
  {
    name: "create_project_task",
    title: "Create Project Task",
    description:
      "Create a follow-up task in the demo project tracker. Use this only after the user has agreed that work should be added. Returns the created task id.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title for the task." },
        description: {
          type: "string",
          description: "What needs to be done, in one or two sentences.",
        },
        owner: {
          type: "string",
          description: "Optional person or team responsible for the task.",
        },
      },
      required: ["title", "description"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: "list_project_tasks",
    title: "List Project Tasks",
    description:
      "List the most recent tasks in the demo project tracker. Use this to confirm a task was created or to review outstanding work.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of tasks to return (1-25). Defaults to 10.",
        },
      },
      required: [],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
];

/* ------------------------------------------------------------------ *
 * Tool implementations — these are the parts that hold real credentials
 * ------------------------------------------------------------------ */

async function researchCompany(args: any) {
  const company = String(args?.company ?? "").trim();
  if (!company) throw new Error("`company` is required.");

  // Real outbound network call. No key needed, but it is a genuine live lookup.
  const search = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      company,
    )}&format=json&srlimit=1&origin=*`,
    { headers: { "user-agent": "hitch-capability-source/0.1" } },
  );

  let summary = "";
  let title = company;
  let sourceUrl = "";

  if (search.ok) {
    const data: any = await search.json();
    const hit = data?.query?.search?.[0];
    if (hit) {
      title = hit.title;
      const page = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
        { headers: { "user-agent": "hitch-capability-source/0.1" } },
      );
      if (page.ok) {
        const p: any = await page.json();
        summary = p.extract ?? "";
        sourceUrl = p?.content_urls?.desktop?.page ?? "";
      }
    }
  }

  if (!summary) {
    summary = `No encyclopedic record was found for "${company}". Treat this as an early-stage or private organization and rely on the user for context.`;
  }

  return {
    company: title,
    summary,
    keyPoints: summary
      .split(/(?<=\.)\s+/)
      .filter((s) => s.trim().length > 24)
      .slice(0, 3),
    source: sourceUrl || "wikipedia.org",
    retrievedAt: new Date().toISOString(),
  };
}

async function draftLaunchAnnouncement(args: any, env: Env) {
  const subject = String(args?.subject ?? "").trim();
  const audience = String(args?.audience ?? "").trim();
  const tone = String(args?.tone ?? "confident").trim();
  if (!subject || !audience) throw new Error("`subject` and `audience` are required.");

  // The model credential lives here, in the capability source. The webpage and
  // the browser agent never see it.
  const prompt =
    `Write a launch announcement for: ${subject}\n` +
    `Audience: ${audience}\n` +
    `Tone: ${tone}\n\n` +
    `Respond with a single headline line prefixed "HEADLINE: ", then a blank line, ` +
    `then two short paragraphs of body copy. No preamble, no markdown, no bullet points.`;

  let raw = "";
  try {
    const out: any = await env.AI.run(MODEL, {
      messages: [
        {
          role: "system",
          content:
            "You are a precise marketing copywriter. You write tight, concrete launch copy with no filler and no em-dashes.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 400,
    });
    raw = String(out?.response ?? "").trim();
  } catch (err: any) {
    throw new Error(
      `The model capability at this source failed: ${err?.message ?? String(err)}`,
    );
  }

  if (!raw) {
    throw new Error("The model returned an empty draft. Try a more specific subject.");
  }

  const headlineMatch = raw.match(/HEADLINE:\s*(.+)/i);
  const headline = (headlineMatch?.[1] ?? subject).trim();
  const body = raw.replace(/HEADLINE:\s*.+/i, "").trim();

  return {
    headline,
    body,
    audience,
    tone,
    model: MODEL,
    generatedAt: new Date().toISOString(),
  };
}

async function createProjectTask(args: any, env: Env) {
  const title = String(args?.title ?? "").trim();
  const description = String(args?.description ?? "").trim();
  if (!title || !description) throw new Error("`title` and `description` are required.");

  const id = `TASK-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const task = {
    id,
    title: title.slice(0, 200),
    description: description.slice(0, 2000),
    owner: String(args?.owner ?? "unassigned").slice(0, 120),
    status: "open",
    createdAt: new Date().toISOString(),
  };

  // Real, durable side effect.
  await env.TASKS.put(`task:${Date.now()}:${id}`, JSON.stringify(task), {
    expirationTtl: 60 * 60 * 24 * 30,
  });

  return { created: true, ...task };
}

async function listProjectTasks(args: any, env: Env) {
  const limit = Math.min(Math.max(Number(args?.limit ?? 10) || 10, 1), 25);
  const listed = await env.TASKS.list({ prefix: "task:", limit: 100 });
  const keys = listed.keys.map((k) => k.name).sort().reverse().slice(0, limit);
  const tasks = [];
  for (const key of keys) {
    const value = await env.TASKS.get(key);
    if (value) tasks.push(JSON.parse(value));
  }
  return { count: tasks.length, tasks };
}

async function callTool(name: string, args: any, env: Env) {
  switch (name) {
    case "research_company":
      return researchCompany(args);
    case "draft_launch_announcement":
      return draftLaunchAnnouncement(args, env);
    case "create_project_task":
      return createProjectTask(args, env);
    case "list_project_tasks":
      return listProjectTasks(args, env);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/* ------------------------------------------------------------------ *
 * MCP Streamable HTTP transport
 * ------------------------------------------------------------------ */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, authorization, accept",
  "access-control-expose-headers": "mcp-session-id",
};

function rpcResult(id: any, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id: any, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleMessage(msg: any, env: Env): Promise<any | null> {
  const { id, method, params } = msg ?? {};

  // Notifications carry no id and expect no response.
  if (id === undefined || id === null) return null;

  switch (method) {
    case "initialize": {
      const requested = params?.protocolVersion;
      const version = SUPPORTED_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSION;
      return rpcResult(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "hitch-cloud-capability-source",
          title: "Hitch Cloud Capability Source",
          version: "0.1.0",
        },
        instructions:
          "A demonstration capability source for Hitch. Holds its own model and storage credentials; exposes four capabilities to authorised MCP clients.",
      });
    }

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, { tools: TOOLS });

    case "tools/call": {
      const name = params?.name;
      const args = params?.arguments ?? {};
      if (!TOOLS.some((t) => t.name === name)) {
        return rpcError(id, -32602, `Unknown tool: ${name}`);
      }
      try {
        const data = await callTool(name, args, env);
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
          isError: false,
        });
      } catch (err: any) {
        return rpcResult(id, {
          content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }],
          isError: true,
        });
      }
    }

    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Human-readable landing page so the endpoint is self-describing.
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(
        JSON.stringify(
          {
            name: "Hitch Cloud Capability Source",
            transport: "MCP Streamable HTTP",
            endpoint: `${url.origin}/mcp`,
            protocolVersion: PROTOCOL_VERSION,
            tools: TOOLS.map((t) => ({ name: t.name, title: t.title })),
          },
          null,
          2,
        ),
        { headers: { "content-type": "application/json", ...CORS } },
      );
    }

    if (url.pathname !== "/mcp") {
      return new Response("Not found", { status: 404, headers: CORS });
    }

    // This server is stateless, so it does not open a server-initiated SSE
    // stream. The MCP client treats 405 here as "no stream available".
    if (request.method === "GET") {
      return new Response("Method Not Allowed", { status: 405, headers: CORS });
    }

    if (request.method === "DELETE") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: CORS });
    }

    let payload: any;
    try {
      payload = await request.json();
    } catch {
      return Response.json(rpcError(null, -32700, "Parse error"), {
        status: 400,
        headers: CORS,
      });
    }

    const batch = Array.isArray(payload) ? payload : [payload];
    const responses = [];
    for (const msg of batch) {
      const res = await handleMessage(msg, env);
      if (res) responses.push(res);
    }

    // Nothing but notifications: acknowledge with 202 per the spec.
    if (responses.length === 0) {
      return new Response(null, { status: 202, headers: CORS });
    }

    const body = Array.isArray(payload) ? responses : responses[0];
    return Response.json(body, {
      headers: { ...CORS, "mcp-session-id": "hitch-cloud-stateless" },
    });
  },
};
