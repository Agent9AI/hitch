# Hitch

**Your capabilities. Your agent. Your control.**

🔗 **Live demo: [hitch.agent9.dev](https://hitch.agent9.dev)** · MIT licensed · built for the [WebMCP Challenge](https://webmcp.devpost.com/)

---

**Hitch is WebMCP in reverse.** Instead of a website handing capabilities to your agent,
you hand capabilities to the website.

WebMCP gives websites a structured way to expose capabilities to AI agents. Hitch asks the
inverse question:

> **What if users could bring capabilities they already own to the web?**

Hitch connects to MCP capability sources you control, discovers what they offer,
lets you grant only the capabilities you choose, registers those grants into the page
with `document.modelContext.registerTool()`, executes them back through MCP, and shows
every agent call in an audit trail you can revoke from at any moment.

The webpage never receives the credentials behind those capabilities. It receives a
callable contract.

---

## The problem

Today, every website that wants an agent to do something useful has to integrate the
services itself: Gmail, GitHub, Notion, Slack, Drive, Calendar, your internal APIs, your
automation infrastructure. Each integration is a separate OAuth flow, a separate token,
a separate silo, rebuilt site by site.

Meanwhile the user usually already has all of that wired up somewhere — in n8n, in an MCP
server, in a local agent, on their own hardware.

The capability exists. It just cannot travel.

## The idea

```
        USER'S EXISTING CAPABILITIES
                    │
                    │  MCP
                    ▼
          ┌───────────────────┐
          │  CAPABILITY LAYER │
          ├───────────────────┤
          │  discover         │
          │  classify         │
          │  approve   ← user │
          │  project          │
          │  execute          │
          │  audit            │
          │  revoke    ← user │
          └───────────────────┘
                    │
                    │  WebMCP
                    ▼
             BROWSER AGENT
```

Three layers, and the middle one is the product:

| Layer | What it is | In this build |
| --- | --- | --- |
| **Source** | Capabilities the user already owns | n8n, hosted MCP servers |
| **Control** | Discovery, risk classification, leases, audit, revocation | Hitch |
| **Surface** | The browser-native agent interface | WebMCP |

This is deliberately not a protocol proxy. A proxy says *protocol A → protocol B*.
Hitch says *discover → classify → approve → lease → project → observe → revoke*.
That control layer is the point.

---

## Architecture

```
              Browser Agent  (ChatGPT in-app browser / Chrome WebMCP)
                    │
                    │  WebMCP — document.modelContext.registerTool()
                    ▼
              Hitch page   (no credentials, no MCP endpoints, no tokens)
                    │
                    │  same-origin HTTPS:  POST /api/execute { source, tool, arguments }
                    ▼
            Capability Bridge  (Cloudflare Worker — the only privileged code)
                    │
                    │  MCP Streamable HTTP  (official @modelcontextprotocol/sdk client)
                    ▼
        ┌───────────────────────┬────────────────────────────┐
        ▼                       ▼                            
   n8n (self-hosted)     Hitch Cloud Source        …any MCP server
   bearer token          model + task store
   holds credentials     holds credentials
```

**Why the MCP client lives on the server.** If the browser held the MCP endpoint, it would
hold the token behind it, and "the page never sees your credentials" would be a slogan
rather than a property. The bridge is the only code that knows a capability source has an
address at all.

---

## How WebMCP is used

The whole projection is one file, deliberately: **[`src/client/lib/webmcp/project.ts`](src/client/lib/webmcp/project.ts)**.

It maps an MCP tool contract onto a WebMCP tool contract with no library in between:

| MCP | → | WebMCP |
| --- | --- | --- |
| `name` | → | `name` |
| `title` | → | `title` |
| `description` | → | `description` |
| `inputSchema` (JSON Schema) | → | `inputSchema` (passed through verbatim) |
| `annotations.readOnlyHint` | → | `annotations.readOnlyHint` |
| server-side execution | → | `execute()` → `POST /api/execute` → MCP `tools/call` |

```ts
await modelContext.registerTool(
  {
    name: capability.name,
    title: capability.title,
    description: capability.description,
    inputSchema: capability.inputSchema,      // the source's schema, untouched
    annotations: {
      readOnlyHint: capability.risk === "read",
      destructiveHint: capability.risk === "dangerous",
      untrustedContentHint: true,             // results are data, never instructions
    },
    execute,                                  // audited, bridged, revocable
  },
  { signal: controller.signal },              // ← the lease
);
```

**Grants are leases, not flags.** Each grant is held by an `AbortController`. Revoking calls
`controller.abort()`, and the abort itself unregisters the tool. There is no second code path
that has to remember to clean up, and a page refresh ends every lease by construction.

**Discovery is not permission.** Nothing reaches `registerTool` until the user clicks Grant.
A capability can be visible, described, risk-labelled and still completely unavailable to the agent.

## How MCP is used

Real MCP, over the network, with the official TypeScript SDK and
`StreamableHTTPClientTransport` — see [`src/worker/mcp/client.ts`](src/worker/mcp/client.ts).

- `GET /api/capabilities` → `initialize` + `tools/list` against every configured source
- `POST /api/execute` → `tools/list` (to re-check the allowlist) + `tools/call`

Every execution re-validates the tool name against a **live** `tools/list` from that source,
so the bridge can only ever invoke something the source is currently advertising. A name the
browser invents is rejected at the bridge, not at the source.

---

## Capability sources in this build

### 1. n8n — the flagship

A self-hosted n8n instance exposing an **MCP Server Trigger** (Streamable HTTP), protected
with bearer auth. The token lives in the Worker as a secret and is never serialised to the page.

n8n matters here because it is already the boundary between agents and real services: it holds
the Gmail token, the GitHub key, the database password. Hitch asks it for a *capability*, and
n8n keeps the credential. The website gets neither.

### 2. Hitch Cloud Source — always available

A separate MCP server ([`src/sources/cloud-source.ts`](src/sources/cloud-source.ts)) running as
its own Cloudflare Worker on its own origin, reached over the public internet exactly like any
third-party MCP server. It holds a Workers AI model binding and a KV task store — credentials
the page also never sees.

It exists so a judge always has a live capability source, without needing our hardware, our
network, or our credentials.

| Capability | Risk | What actually happens |
| --- | --- | --- |
| `research_company` | READ | Live Wikipedia search + summary fetch |
| `draft_launch_announcement` | GENERATIVE | Real inference on Workers AI (Llama 3.3 70B) |
| `create_project_task` | WRITE | Durable write to Cloudflare KV |
| `list_project_tasks` | READ | Reads those writes back |

---

## Security model

| Boundary | Guarantee |
| --- | --- |
| **Credential** | MCP endpoints and tokens exist only in Worker environment bindings. The client bundle contains no endpoint, no token, no key. |
| **Capability** | Only tools returned by a live `tools/list` can be executed. Unknown names and unknown sources are rejected at the bridge. |
| **Consent** | Discovery never registers anything. A capability becomes agent-visible only on an explicit user grant. |
| **Context** | Tools are registered into this document's model context, not into the browser at large. |
| **Time** | A lease lasts for the page session. Refresh revokes everything. |
| **Visibility** | Every request, completion and failure is written to the audit log before and after the call. |
| **Revocation** | `controller.abort()` unregisters the tool immediately. |
| **Content** | Results carry `untrustedContentHint`: capability output is data to show the user, never instructions for the agent to follow. |

Risk classification is **not** done by a model. It reads MCP annotations, applies a reviewed
local mapping, and falls back to `write` for anything unrecognised, so a new tool appearing at a
source can never quietly present itself as harmless.
See [`src/worker/policy/risk.ts`](src/worker/policy/risk.ts).

More detail: [docs/SECURITY.md](docs/SECURITY.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Try it

1. Open **[hitch.agent9.dev](https://hitch.agent9.dev)** in ChatGPT's in-app browser, or in
   Chrome with WebMCP enabled.
2. Capabilities are discovered live over MCP. **Grant** the ones you want.
3. Ask your agent something that needs them, for example:
   > *Research Anthropic, draft a short launch announcement for developers, and create a follow-up task.*
4. Watch **Agent activity** record each call, its risk class and its duration.
5. Hit **Revoke all**. The tools stop existing for the agent immediately.

Without a WebMCP browser the page still works: discovery and execution are real, and the
**Local test call** panel invokes the exact closure that was handed to `registerTool`. Grants
made without WebMCP present are labelled `local only` rather than pretending an agent can see them.

## Run it yourself

```bash
npm install
cp .env.example .dev.vars     # point MCP_* at your own capability sources
npm run build
npx wrangler dev              # bridge on :8787
npm run dev                   # UI on :5173, proxying /api to the bridge
```

Deploy: `npm run deploy` (app) and `npm run deploy:source` (the demo capability source).

---

## Built during the WebMCP Challenge

- MCP → WebMCP capability projection
- Native `document.modelContext.registerTool()` implementation, no wrapper library
- `AbortController`-based capability leases with immediate revocation
- User-approval gate between discovery and registration
- Capability risk classification from MCP annotations, conservative by default
- Server-side MCP execution proxy with live-discovery allowlisting
- Agent activity auditing for every call
- n8n MCP Server Trigger integration as a user-owned capability source
- A standalone MCP server so the demo needs nothing of ours to run

## What this is not

Hitch does not inject tools into arbitrary websites. WebMCP scopes registered tools to a
document and its origin, and that scoping is correct. What Hitch demonstrates is the
capability-projection primitive inside a WebMCP-native page.

Making those user-owned capabilities portable **across** compatible web experiences is the
natural next layer, and it needs a local capability runtime rather than a page.

## Where this goes

Origin-scoped and time-scoped leases · argument constraints and spend limits · confirmation
gates for destructive capabilities · signed capability manifests · many sources at once ·
a local capability daemon for hardware, local agents and private networks · portable
capability profiles that follow the user between sites.

> The agentic web should not only know what a website can do.
> It should also know what the user can bring.

## License

MIT — see [LICENSE](LICENSE).
