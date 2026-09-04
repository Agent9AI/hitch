# Security model

Loadout's entire reason to exist is the boundary between a capability and the
credential behind it. This document states what is actually enforced, and what
is not.

## What the page can and cannot see

| | In the browser | On the bridge |
| --- | --- | --- |
| Capability name, title, description, JSON Schema | ✅ | ✅ |
| Risk classification | ✅ | ✅ |
| MCP endpoint URL | ❌ | ✅ |
| MCP bearer token | ❌ | ✅ |
| Model API credentials | ❌ | ❌ (held by the source) |
| Storage credentials | ❌ | ❌ (held by the source) |

The client bundle is ~11 KB and contains no endpoint, no token and no key.
Grep it.

## Boundaries

**Credential.** MCP endpoints and tokens are Worker environment bindings and KV
values. They are never serialised into a response body.

**Capability.** `POST /api/execute` re-reads `tools/list` from the source and
rejects any name the source is not currently advertising. The bridge's
authority is always a subset of the source's.

**Consent.** Discovery never registers anything. `registerTool` is reached only
from `projectCapability()`, which is only called from a user click.

**Context.** Tools are registered into this document's model context. WebMCP
scopes them to the document and origin, and Loadout does not attempt to escape
that scoping.

**Time.** A grant lives for the page session. A connection lease to a
user-supplied source lives one hour in KV, then expires on its own.

**Visibility.** Every call writes a `requested` event before it goes out and a
`completed` or `failed` event when it returns, including duration and error text.

**Revocation.** `controller.abort()` unregisters the tool. Because the
`AbortSignal` is the mechanism rather than a bookkeeping flag, there is no state
where the UI shows revoked but the agent still sees the tool.

**Content.** Every projected tool carries `untrustedContentHint: true`. A
capability result is third-party content: data to show the user, never
instructions for the agent to follow.

## Server-side request forgery

"Connect your own MCP server" makes the bridge fetch a URL a stranger typed.
`src/worker/policy/guard.ts` constrains it before any connection is attempted:

- HTTPS only, so a pasted token never travels in the clear
- `localhost`, `0.0.0.0`, `::1` and cloud metadata hostnames rejected
- RFC1918, loopback, link-local and carrier-grade NAT ranges rejected
- IPv6 unique-local and link-local prefixes rejected
- `.local`, `.internal` and bare hostnames rejected
- Bearer tokens are length-capped and stripped of CR/LF to prevent header injection
- Remote error text is truncated to 200 characters before it reaches the page

## Risk classification

Risk is not inferred by a model. `src/worker/policy/risk.ts`:

1. an explicit reviewed mapping wins
2. then MCP `destructiveHint` / `readOnlyHint` annotations
3. then conservative name heuristics
4. otherwise `write`

A tool that appears at a source without annotations and without a match cannot
present itself as read-only.

## What this build does not do

It has no accounts, no persistence of grants, no origin-scoped or time-scoped
lease policy beyond the session, no argument constraints, no spend limits and
no confirmation gate for destructive capabilities. Those are the natural next
layer and are named as future work rather than implied by the UI.

A capability source is trusted to describe itself honestly. Loadout classifies
and constrains what it advertises, but it does not verify that a source's
implementation matches its description. Signed capability manifests are the
answer there, and are not built here.
