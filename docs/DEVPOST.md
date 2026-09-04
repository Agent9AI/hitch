# Devpost submission copy

**Project name:** Hitch
**Tagline:** Hitch your capabilities to any page. WebMCP, in reverse.
**Live demo:** https://hitch.agent9.dev
**Repository:** https://github.com/Agent9AI/hitch (MIT)

---

## Inspiration

Every website that wants an agent to do something useful has to integrate the services
itself. Gmail. GitHub. Notion. Slack. Drive. Calendar. Your internal APIs. Each one is a
separate OAuth flow, a separate token, a separate silo, rebuilt from scratch site by site.

Meanwhile the user usually already has all of it wired up somewhere: in n8n, in an MCP
server, in a local agent, on their own hardware. The capability already exists. It just
cannot travel.

So we asked the inverse of the usual WebMCP question. Not *what can this website give my
agent*, but **what can I bring to this website?**

## What it does

Hitch is a user-controlled capability layer between MCP and WebMCP.

1. **Discover.** It connects to MCP capability sources you own and lists what they offer.
2. **Classify.** Each capability gets a risk class from its MCP annotations, conservative by default.
3. **Approve.** Nothing is available to your agent until you grant it. Discovery is not permission.
4. **Project.** A grant becomes a live WebMCP tool via `document.modelContext.registerTool()`.
5. **Execute.** The agent calls it; the call travels through our bridge to `tools/call`.
6. **Audit.** Every request, completion and failure appears on screen with its risk and duration.
7. **Revoke.** One click aborts the lease and the tool stops existing for the agent.

And you can point it at your own MCP server from the page in about four seconds.

## Why WebMCP is the right fit

WebMCP is what makes this possible at all. The whole product is the act of moving
user-owned capabilities into a structured, browser-native agent interface, and WebMCP is the
only surface where that can happen without a browser extension or a bespoke agent runtime.

Three properties of WebMCP are doing real work here:

- **Dynamic registration.** Tools are registered at runtime from data discovered over the
  network, not declared at build time. The page has no idea what tools it will host until
  the user decides.
- **Signal-based lifecycle.** `registerTool` accepts an `AbortSignal`. That single design
  choice is what lets a permission grant be a *lease* rather than a flag, because revocation
  and unregistration are the same event. We did not have to invent a revocation mechanism.
- **Annotations.** `readOnlyHint`, `destructiveHint` and `untrustedContentHint` let us carry
  a capability's risk profile from MCP through to the agent, unbroken.

## How it improves the experience

The old loop: open the service, authenticate, navigate, copy, paste, switch context, repeat.

The new loop: grant the capability once, then say what you want.

The difference is not that the agent gained abilities. It is that **you decided which
abilities, for how long, and you can watch every use of them.** Most agent tooling asks you
to trust broadly and observe nothing. Hitch inverts both.

## What people and agents can now do together

The division of labour is clean, and it is the reason this is safe enough to actually use:

- **The human decides what is permissible.** Which capabilities exist in this context, at
  what risk level, for how long.
- **The agent decides what is useful.** Which of the approved capabilities help with the
  task at hand, in what order, with what arguments.

Neither can do the other's job. The agent cannot widen its own permissions; the human does
not have to anticipate every step. That was not previously feasible in the browser, because
there was no way to hand an agent a scoped, revocable, observable capability that the page
itself did not own.

## How we built it

- **Frontend:** TypeScript, no framework. ~10 KB of JavaScript. The WebMCP integration is one
  readable file, `src/client/lib/webmcp/project.ts`, deliberately not hidden behind a wrapper.
- **Bridge:** a Cloudflare Worker holding the official `@modelcontextprotocol/sdk` client over
  `StreamableHTTPClientTransport`. Three endpoints: discover, connect, execute.
- **Capability sources:** a self-hosted n8n instance exposing an MCP Server Trigger with bearer
  auth, plus a standalone MCP server we wrote (`src/sources/cloud-source.ts`) running as its own
  Worker on its own origin, holding a Workers AI model binding and a KV store.

The MCP client lives on the server for one reason: if the browser held the endpoint, it would
hold the token, and "the page never sees your credentials" would be marketing rather than a
property of the system.

## Security model

- MCP endpoints and tokens exist only as Worker secrets. The client bundle contains none of them.
- Every execution re-reads `tools/list` from the source, so the bridge can only invoke what the
  source is currently advertising.
- User-supplied MCP servers pass an SSRF guard: HTTPS only, no loopback, no RFC1918, no
  link-local, no cloud metadata endpoints, no `.local` or `.internal`.
- A pasted MCP token is exchanged for an opaque handle that expires in an hour. It never lives
  in the browser or in `localStorage`.
- Risk classification is annotation-driven and falls back to `write`, never to `read`.
- Every projected tool carries `untrustedContentHint`: capability output is data to show the
  user, never instructions for the agent to follow.

## Challenges

**Worker-to-Worker on one zone.** Cloudflare rejects subrequests between Workers in the same
zone (error 1042), which broke the bridge the moment it went to production even though it
worked locally. The app now runs on a custom domain and the capability source on `workers.dev`,
which makes the hop a genuine external request rather than a loopback.

**Making "connect your own MCP" safe.** Letting anyone hand the bridge a URL to fetch is an
SSRF primitive. It needed a real guard and an expiring credential handle before it could ship,
not after.

**Honest degradation.** In a browser without WebMCP, the temptation is to pretend. Instead a
grant made without WebMCP present is held locally, labelled `local only`, and the UI says
plainly that no agent-visible tool was registered.

## Accomplishments

Two independent MCP sources, seven live capabilities, real reads, real model inference and
real durable writes, in a page that holds zero credentials and about 10 KB of JavaScript.

## What's next

Origin-scoped and time-scoped leases. Argument constraints and spend limits. Confirmation
gates for destructive capabilities. Signed capability manifests, so a source can prove its
implementation matches its description. And a local capability runtime, so the same grants can
follow a user across compatible sites instead of living on one page.

> The agentic web should not only know what a website can do.
> It should also know what the user can bring.
