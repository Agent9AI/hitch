/**
 * The guided tour.
 *
 * Two audiences, one script:
 *
 *  - A judge who lands here cold and wants the thesis in ninety seconds.
 *  - Whoever is recording the demo, who needs a line to say and a cue for what
 *    to do next.
 *
 * Every step that performs an action drives the real controls. The tour clicks
 * the same buttons a visitor clicks and runs the same code path an agent runs,
 * so nothing here is a simulation of the product.
 */

export interface TourStep {
  id: string;
  /** CSS selector to spotlight. Omit for a centred card. */
  target?: string;
  /** Short label above the narration. */
  title: string;
  /** The line to say on camera. Written to be read aloud. */
  say: string;
  /** Director's note: what to do while saying it. Not narration. */
  note?: string;
  /** Pacing hint in seconds, used to total the runtime. */
  seconds: number;
  /** Runs before the step is shown. Drives the real UI. */
  before?: () => Promise<void> | void;
  placement?: "top" | "bottom";
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const click = async (selector: string, settle = 700) => {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return;
  element.click();
  await wait(settle);
};

/** Drive the local test call panel, which runs a granted capability for real. */
async function runCapability(tool: string, args: Record<string, unknown>) {
  const select = document.querySelector<HTMLSelectElement>("#test-tool");
  const input = document.querySelector<HTMLInputElement>("#test-args");
  const run = document.querySelector<HTMLButtonElement>("#test-run");
  if (!select || !input || !run || run.disabled) return;

  const option = [...select.options].find((o) => o.value === tool);
  if (!option) return;

  select.value = tool;
  input.value = JSON.stringify(args);
  run.click();
  await wait(3200);
}

/** Put the page back to a clean slate so the tour always starts the same way. */
async function resetGrants() {
  const anyGranted = document.querySelectorAll(".cap.on").length > 0;
  if (anyGranted) await click("#revoke-all", 400);
}

export const TOUR: TourStep[] = [
  {
    id: "open",
    target: ".stats .stat:nth-child(2)",
    title: "Start here",
    say: "This website has no Gmail token. No GitHub key. No model API key. No database password. It holds nothing.",
    note: "That number is a live scan of everything the server sent this page, not a hardcoded zero. Hover it.",
    seconds: 11,
    before: resetGrants,
  },
  {
    id: "sources",
    target: "#sources",
    title: "But I own things that do",
    say: "These are two MCP servers I control. One is hosted, one is my own n8n instance. Neither of them has given this page a credential.",
    note: "Both dots green. Say the word 'mine' at least once.",
    seconds: 10,
  },
  {
    id: "inversion",
    target: "#flow",
    title: "The inversion",
    say: "WebMCP lets a website hand capabilities to your agent. Hitch runs it backwards. You hand capabilities to the website.",
    note: "This is the whole pitch. Slow down. Let the pulse run left to right once.",
    seconds: 12,
  },
  {
    id: "discovery",
    target: "#capabilities",
    title: "Discovery is not permission",
    say: "Seven capabilities, discovered live over MCP. Every one of them is visible, described, and risk labelled. And not one is available to my agent yet.",
    note: "Point at the READ, GENERATIVE and WRITE tags. Nothing is granted.",
    seconds: 11,
  },
  {
    id: "grant",
    target: "#lease",
    title: "Granting three",
    say: "Nothing reaches my agent until I say so. Watch what happens when I grant three of them.",
    note: "The tour just clicked Grant. Cards turn green, the lease panel fills, the counter climbs.",
    seconds: 10,
    before: async () => {
      await click("#grant-demo", 900);
    },
  },
  {
    id: "registered",
    target: "#lease .scope",
    title: "Now they exist",
    say: "Three real WebMCP tools, registered into this document with registerTool. Each one held open by an AbortController. That controller is the lease.",
    note: "Read the 'registered in WebMCP' number out loud. It comes from the browser, not from us.",
    seconds: 12,
  },
  {
    id: "execute",
    target: "#activity",
    title: "An agent uses one",
    say: "So I ask my agent to research a company. It picks the capability, calls it, and the call travels through our bridge into the server that actually holds the credential.",
    note: "The tour is running a real capability right now. Watch the flow bar light up and the log fill.",
    seconds: 14,
    before: async () => {
      await runCapability("research_company", { company: "Anthropic" });
    },
  },
  {
    id: "audit",
    target: "#activity",
    title: "Nothing is silent",
    say: "Every call is announced before it goes out and recorded when it comes back, with its risk class and how long it took. No agent action on this page is invisible.",
    note: "Point at the requested row, then the completed row and the millisecond timing.",
    seconds: 12,
  },
  {
    id: "revoke",
    target: "#revoke-all",
    title: "And I can take it back",
    say: "A grant is a lease, not a switch. Revoking aborts the signal, and the tools stop existing for my agent. Not hidden. Gone.",
    note: "The tour just revoked. If you can, ask the agent to use one and let it fail on camera.",
    seconds: 12,
    before: async () => {
      await click("#revoke-all", 700);
    },
  },
  {
    id: "byo",
    target: "#byo-url",
    title: "The part that matters to you",
    say: "And it is not limited to my servers. Paste any MCP server that speaks Streamable HTTP, and its tools become capabilities here in about four seconds. Your URL and token go to the bridge once and come back as an expiring handle, so this page never holds your credential either.",
    note: "If you have a URL handy, actually paste one. Live is better than described.",
    seconds: 15,
  },
  {
    id: "close",
    title: "Close",
    say: "MCP built the ecosystem of tools. WebMCP built the browser surface for agents. Hitch is the user controlled layer between them. Discover, approve, project, observe, revoke.",
    note: "Land it on the last line, then stop talking.",
    seconds: 13,
  },
  {
    id: "kicker",
    target: ".stats",
    title: "The kicker",
    say: "The agentic web should not only know what a website can do. It should know what you can bring.",
    note: "Three projected, zero credentials. Hold the shot for a beat, then cut.",
    seconds: 8,
    before: async () => {
      await click("#grant-demo", 800);
    },
  },
];

export const TOUR_SECONDS = TOUR.reduce((total, step) => total + step.seconds, 0);
