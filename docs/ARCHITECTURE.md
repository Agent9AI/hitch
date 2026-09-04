# Architecture

## Request paths

There are exactly three server endpoints. Everything else is static.

```
GET  /api/capabilities   discover from every preconfigured source
POST /api/connect        attach a source the user owns, return a lease handle
POST /api/execute        run one approved capability through MCP
```

### Discovery

```
GET /api/capabilities
        │
        ├─ for each configured source (in parallel)
        │     initialize            MCP
        │     tools/list            MCP
        │     normalise schema
        │     classify risk         policy/risk.ts
        │
        └─ { sources[], capabilities[] }
```

A source that is offline degrades to `online: false` with its error. It never
takes the rest of the page down.

### Connecting your own source

```
POST /api/connect { url, token? }
        │
        ├─ guardSourceUrl()         policy/guard.ts   HTTPS only, no private space
        ├─ listTools()              proves it is a real, reachable MCP server
        ├─ KV.put(lease:<handle>)   url + token, TTL 1 hour
        │
        └─ { source: { id: "byo:<handle>" }, capabilities[] }
```

The browser receives the handle. It never receives the URL back, and never
receives the token back. When the TTL expires the source simply stops
resolving, and the user reconnects.

### Execution

```
POST /api/execute { source, tool, arguments }
        │
        ├─ resolve source           preconfigured, or a lease handle from KV
        ├─ tools/list               MCP, re-check the allowlist, live
        ├─ reject unknown names
        ├─ tools/call               MCP
        ├─ normalizeMcpResult()
        │
        └─ { ok, data, text, raw, durationMs }
```

## Why the allowlist is re-read on every call

Caching the discovered tool set would mean the bridge could keep executing a
capability after the source stopped offering it. Re-reading `tools/list` costs
one round trip and makes the bridge's authority strictly a subset of the
source's current advertisement.

## Client structure

```
src/client/
├── main.ts                     rendering and wiring only
├── lib/
│   ├── api.ts                  the three fetches, nothing else
│   ├── audit/events.ts         append-only in-memory event log
│   └── webmcp/
│       ├── project.ts          ★ MCP → WebMCP projection, leases, revocation
│       └── support.ts          document.modelContext / navigator.modelContext
└── types/
    ├── capability.ts
    └── webmcp.d.ts             minimal ambient WebMCP types
```

`project.ts` is the only file that talks to WebMCP. Nothing else in the client
imports `modelContext`, so there is exactly one place where a capability can
become agent-visible.

## Server structure

```
src/worker/
├── index.ts                    router, three endpoints
├── mcp/
│   ├── client.ts               official MCP SDK, Streamable HTTP
│   └── normalize.ts            content blocks → structured result
└── policy/
    ├── risk.ts                 annotation-driven risk classification
    └── guard.ts                SSRF guard for user-supplied sources
```

## The demo capability source

`src/sources/cloud-source.ts` is a separate Worker, deployed separately, on a
separate origin. It implements MCP Streamable HTTP directly, roughly 200 lines
of protocol handling, so the repository contains both halves of a real MCP
conversation and neither is mocked.

It must not share a zone with the app: Cloudflare rejects Worker-to-Worker
subrequests within one zone (error 1042). The app runs on a custom domain and
the source on `workers.dev`, which is what makes the hop a genuine external
request.
