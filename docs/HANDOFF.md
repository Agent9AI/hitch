# Handoff

Everything is built, deployed and verified. This is what you need and nothing else.

## Links

| What | Where |
| --- | --- |
| **Live app** | https://hitch.agent9.dev |
| **Repo** | https://github.com/Agent9AI/hitch (public, MIT detected) |
| **Demo video script** | [docs/DEMO.md](DEMO.md), beat by beat, timed to 2:20 |
| **Devpost copy** | [docs/DEVPOST.md](DEVPOST.md), paste straight in |
| Capability source (own MCP server) | https://hitch-capability-source.terry-c87.workers.dev/mcp |
| n8n MCP source | on eagle, exposed through the existing tunnel, bearer-protected |

## Verified working as of this handoff

- **13 integration tests and 6 unit tests, all passing against the live site.** Run
  `npm test` yourself. The integration suite drives the real page against a strict,
  spec-faithful WebMCP host and asserts registration, contract fidelity, response shape,
  auditing, failure handling and revocation.
- 2 live MCP sources, 7 capabilities discovered over real MCP Streamable HTTP
- Real read (live Wikipedia), real generation (Workers AI Llama 3.3 70B), real durable write (KV)
- n8n capabilities executing end to end through the bridge, ~700ms to 1.1s
- Opaque n8n contracts harmonised into clean typed JSON Schemas
- Connect-your-own-MCP working, with SSRF guard and expiring credential handles
- SSRF guard rejects http, localhost, RFC1918, link-local, `.local`
- Client bundle 13 KB. A test asserts it ships no absolute URL, no token material and no
  reference to the n8n endpoint.

## Three conformance bugs the tests caught

Worth knowing, because they are the strongest thing to say if a judge asks about rigour:

1. `execute()` was returning a bare string. The specification requires a content-block
   response, so **every tool result would have been malformed in a real WebMCP browser.**
2. `getTools()` was being treated as synchronous when it returns a promise.
3. A failing capability threw away the source's own error message before it reached the agent.

None of these were findable by clicking around, because no WebMCP browser was available to
click in. They were found by writing a strict host and running the real page against it.

## Test it in 90 seconds

1. Open https://hitch.agent9.dev **in a WebMCP browser** (ChatGPT in-app browser, or Chrome
   with the WebMCP flag). In plain Chrome it works but says WebMCP unavailable, which is correct.
2. Click **Grant the 3 it needs** in the "Try this" bar.
3. Click **Copy prompt**, paste it to your agent.
4. Watch the Agent activity panel fill.
5. Click **Revoke all**, ask the agent again, confirm the tools are gone.

If you have no WebMCP browser: use the **Local test call** panel at the bottom right. It runs
the exact closure that was handed to `registerTool`, so it proves the same path.

## Shooting the video

Follow [docs/DEMO.md](DEMO.md). The single most important thing is the first 12 seconds:
open on `0 SERVICE CREDENTIALS IN THIS PAGE` and say the site has nothing, then bring your own.

Two shots worth getting right:
- The activity log filling in real time. Do not cut the latency, it is the proof.
- The revoke. Toggle a capability off, then let the agent fail to use it on camera.

## Submitting

- [ ] YouTube video, public, under 3 minutes, with audio
- [ ] Live URL: `https://hitch.agent9.dev`
- [ ] Repo URL: `https://github.com/Agent9AI/hitch`
- [ ] Paste the text from [docs/DEVPOST.md](DEVPOST.md)
- [ ] Confirm the MIT badge shows in the repo's About sidebar

## One optional upgrade, deliberately not taken

The strongest possible n8n beat would be a capability that reaches a service only n8n can see,
for example something on eagle's private network, to prove "your browser cannot reach this;
n8n is inside." It was skipped because adding a tool requires an n8n restart, which means a
15 to 20 minute outage on the Pi, and the current n8n source already works. If you want it
later, it is a workflow edit plus a restart, and worth about 20 minutes.

## Two things to know

**eagle is the weak link.** n8n runs on the Pi behind the existing tunnel. Its SQLite database
has grown to 77 MB and it prunes on every restart, which pegs the Pi for 15 to 20 minutes and
returns 503 the whole time. Do not restart n8n before filming. If it is down at demo time the
UI reports it offline honestly and the Hitch Cloud Source carries the demo on its own.

**The n8n secrets** live only as Worker secrets (`MCP_N8N_URL`, `MCP_N8N_TOKEN`). They are not
in the repo and not in `wrangler.jsonc`. If you ever need to rotate them:
`npx wrangler secret put MCP_N8N_TOKEN`.

## Redeploying

```bash
npm run deploy          # app -> hitch.agent9.dev
npm run deploy:source   # the demo capability source
```
