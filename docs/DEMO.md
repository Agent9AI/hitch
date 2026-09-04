# Demo video script

**Target: 2:20. Hard ceiling 3:00.** Screen recording with voiceover. No slides until the
final 20 seconds. The product does the talking.

**Theme:** a hitch is the thing that lets you bring your own load somewhere it could not
otherwise go. Every beat returns to *bring*, *attach*, *detach*.

**Setup before recording**
- `hitch.agent9.dev` open in a WebMCP-capable browser, nothing granted yet
- Agent panel open beside it
- Zoom to ~110% so the activity log is readable on a phone
- Have the repo open in a second tab, scrolled to `project.ts`

---

## 0:00 – 0:12 · Cold open

**Screen:** the live page. Cursor drifts to the stat strip and rests on
`0 SERVICE CREDENTIALS IN THIS PAGE`.

> "This website has no Gmail token. No GitHub key. No model API key. No database password.
> It has nothing."

**Screen:** cursor moves up to the two source rows, both showing a green dot.

> "But I already own tools that do. So let me bring them."

---

## 0:12 – 0:28 · The inversion

**Screen:** slow scroll across the four-node flow bar: Source → Control → Surface → Consumer.

> "WebMCP lets a website hand capabilities to your agent. Hitch runs it backwards.
> You hand capabilities to the website."

> "These seven came from two MCP servers I control. One is a hosted server. One is my own
> n8n instance. Neither of them gave this page a credential."

---

## 0:28 – 0:50 · Granting

**Screen:** click Grant on `research_company`, then `draft_launch_announcement`, then
`create_project_task`. Each card snaps to a green left edge. The lease panel fills. The
counter climbs 1, 2, 3.

> "Discovery is not permission. Nothing is available to my agent until I say so."

**Screen:** quick cut to `src/client/lib/webmcp/project.ts`, the `registerTool` call, two
seconds on `{ signal: controller.signal }`.

> "Each grant is a real `document.modelContext.registerTool` call, held open by an
> AbortController. That controller is the lease."

---

## 0:50 – 1:28 · The agent works

**Screen:** type into the agent:

> *"Research Anthropic, draft a short launch announcement for developers, then create a
> follow-up task for the team."*

**Screen:** stay on the Hitch window, not the agent. The flow bar lights green. Cards pulse
as they execute. Activity log fills line by line.

> "Watch the page, not the agent. Every call is announced before it goes out and recorded
> when it comes back, with its risk class and how long it took."

**Screen:** point at the three completed rows.

> "Read. Generative. Write. The read hit a live search. The generative one ran on a model
> whose key lives at the source, not here. And the write actually wrote."

**Screen:** run `list_project_tasks` to show the task that was just created.

> "There it is. A real side effect, caused by an agent, through a capability I granted for
> the next five minutes."

---

## 1:28 – 1:45 · Taking it back

**Screen:** click Grant on `create_project_task` to toggle it off. The card goes grey. The
lease panel drops to two.

> "And I can take it back."

**Screen:** ask the agent to create another task. It reports the tool is gone.

> "The AbortController fired. The tool no longer exists for the agent. Not hidden. Gone."

---

## 1:45 – 2:08 · The part that matters to you

**Screen:** scroll to "Connect your own capability source". Paste an MCP URL. Click Connect.
New source row appears, its capabilities join the list.

> "And it is not limited to my servers. Paste any MCP server that speaks Streamable HTTP and
> its tools become capabilities here, grantable to your agent, in about four seconds."

> "Your URL and token go to the bridge once and come back as an expiring handle. This page
> never holds your credential either."

---

## 2:08 – 2:25 · Close

**Screen:** the architecture diagram from the README, held still.

> "MCP built the ecosystem of tools. WebMCP built the browser-native surface for agents.
> Hitch is the user-controlled layer between them: discover, approve, project, observe, revoke."

**Screen:** cut back to the page, cursor on the stat strip: 3 projected, 0 credentials.

> "The agentic web should not only know what a website can do. It should know what you can bring."

---

## Recording notes

- **Do not narrate the UI.** Say what it means, let the screen show what it does.
- Let the activity log fill in real time. The latency is the proof; do not cut it out.
- If a call fails on camera, keep it. A visible failed row in the audit log demonstrates the
  point better than a clean take.
- Keep the mouse still while talking. Move only to act.
- Capture at 1920x1080. Upload public to YouTube. Put the repo link in the description.
