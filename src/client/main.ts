/**
 * Hitch — application shell.
 *
 * Holds no credentials, no MCP endpoints and no tokens. It renders discovered
 * capability contracts, records the user's grants, and delegates every
 * privileged action to the bridge.
 */
import "./style.css";
import type { Capability, CapabilitiesResponse, CapabilitySource } from "./types/capability";
import { fetchCapabilities, connectSource } from "./lib/api";
import { audit, onAudit, auditCounts, type AuditEvent } from "./lib/audit/events";
import { isWebMCPSupported, webmcpSurface } from "./lib/webmcp/support";
import {
  projectCapability,
  revokeCapability,
  isProjected,
  projectedNames,
  setExecutionHook,
  inspectRegisteredTools,
  invokeProjected,
  isRegistered,
} from "./lib/webmcp/project";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let capabilities: Capability[] = [];
let sources: CapabilitySource[] = [];
const running = new Set<string>();

const RISK_LABEL: Record<string, string> = {
  read: "read",
  generate: "generative",
  write: "write",
  spend: "spend",
  dangerous: "dangerous",
};

const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/* ------------------------------ WebMCP state ---------------------------- */

function renderWebMCPStatus() {
  const pill = $("webmcp-pill");
  const notice = $("webmcp-notice");
  const supported = isWebMCPSupported();

  if (supported) {
    pill.className = "pill ok";
    pill.innerHTML = `<span class="dot"></span>WebMCP ready · ${esc(webmcpSurface())}`;
    notice.hidden = true;
  } else {
    pill.className = "pill warn";
    pill.innerHTML = `<span class="dot"></span>WebMCP unavailable`;
    notice.hidden = false;
    notice.innerHTML =
      `<b>This browser does not expose WebMCP.</b> Hitch still discovers your capabilities over a real MCP ` +
      `connection and the bridge still executes them, so you can exercise the whole path with the local test call ` +
      `below. To see capabilities registered as live agent tools, open this page in ChatGPT's in-app browser, or ` +
      `in Chrome with the WebMCP flag enabled, where <code>document.modelContext</code> is present.`;
  }
  return supported;
}

/* -------------------------------- sources ------------------------------- */

function renderSources() {
  $("sources").innerHTML = sources
    .map(
      (s) => `
      <div class="source ${s.online ? "online" : ""}">
        <span class="status"></span>
        <div style="min-width:0">
          <div class="name">${esc(s.label)}</div>
          <div class="blurb">${esc(s.online ? s.blurb : s.error || "Source unreachable.")}</div>
        </div>
        <div class="count">${s.online ? `${s.count} capabilities` : "offline"}</div>
      </div>`,
    )
    .join("");

  const live = sources.filter((s) => s.online).length;
  $("source-meta").textContent = `${live} of ${sources.length} connected`;
  $("stat-sources").textContent = String(live);
}

/* ----------------------------- capabilities ----------------------------- */

function renderCapabilities() {
  const host = $("capabilities");

  if (!capabilities.length) {
    host.innerHTML = `<div class="lease-empty">No capabilities discovered. Every configured source is offline.</div>`;
    $("cap-meta").textContent = "";
    return;
  }

  host.innerHTML = capabilities
    .map((c) => {
      const on = isProjected(c.name);
      const busy = running.has(c.name);
      return `
        <div class="cap ${on ? "on" : ""} ${busy ? "running" : ""}" data-cap="${esc(c.name)}">
          <div class="cap-top">
            <div style="min-width:0">
              <div class="cap-title">${esc(c.title)}</div>
              <div class="cap-name">${esc(c.name)}</div>
            </div>
            <button class="grant ${on ? "on" : ""}" data-grant="${esc(c.name)}">
              ${on ? "Granted" : "Grant"}
            </button>
          </div>
          <div class="cap-desc">${esc(c.description)}</div>
          <div class="tags">
            <span class="tag ${esc(c.risk)}">${esc(RISK_LABEL[c.risk] ?? c.risk)}</span>
            <span class="tag src">${esc(c.source.label)}</span>
          </div>
        </div>`;
    })
    .join("");

  $("cap-meta").textContent = `${capabilities.length} discovered`;

  host.querySelectorAll<HTMLButtonElement>("button[data-grant]").forEach((btn) => {
    btn.addEventListener("click", () => toggle(btn.dataset.grant!));
  });
}

async function toggle(name: string) {
  const cap = capabilities.find((c) => c.name === name);
  if (!cap) return;

  try {
    if (isProjected(name)) {
      revokeCapability(cap);
    } else {
      await projectCapability(cap);
    }
  } catch (err: any) {
    audit({
      tool: name,
      source: cap.source.label,
      stage: "failed",
      risk: cap.risk,
      detail: err?.message ?? String(err),
    });
  }
  renderAll();
}

/* -------------------------------- lease --------------------------------- */

function renderLease() {
  const granted = capabilities.filter((c) => isProjected(c.name));
  const host = $("lease");

  if (!granted.length) {
    host.innerHTML = `<div class="lease-empty">
      Nothing granted. Your browser agent currently sees no tools from this page.<br />
      Discovery is not permission: capabilities exist above, but none of them have been projected.
    </div>`;
  } else {
    const registered = inspectRegisteredTools();
    host.innerHTML =
      granted
        .map(
          (c) => `<div class="lease-row">
            <span class="check">✓</span>
            <span style="flex:1;min-width:0">${esc(c.title)}<br /><code>${esc(c.name)}</code></span>
            <span class="tag ${isRegistered(c.name) ? esc(c.risk) : "src"}">${
              isRegistered(c.name) ? esc(RISK_LABEL[c.risk] ?? c.risk) : "local only"
            }</span>
          </div>`,
        )
        .join("") +
      `<div class="scope">
         <span>Scope: this document, this session</span>
         <span>${
           registered ? `${registered.length} registered in WebMCP` : "revocable at any time"
         }</span>
       </div>`;
  }

  $("stat-projected").textContent = String(granted.length);
  refreshTestTools(granted);
}

/* ------------------------------- activity ------------------------------- */

function renderActivity(events: AuditEvent[]) {
  const host = $("activity");
  const icon: Record<string, string> = {
    requested: "→",
    completed: "✓",
    failed: "✕",
    granted: "+",
    revoked: "−",
  };

  if (!events.length) {
    host.innerHTML = `<div class="lease-empty" style="padding:10px 6px">
      No activity yet. Grants, revocations and every agent call appear here.
    </div>`;
  } else {
    host.innerHTML = events
      .slice(0, 60)
      .map(
        (e) => `<div class="evt ${esc(e.stage)}">
          <span class="t">${new Date(e.timestamp).toLocaleTimeString([], { hour12: false })}</span>
          <span class="i">${icon[e.stage] ?? "·"}</span>
          <span class="n">${esc(e.tool)}</span>
          <span class="d">${e.durationMs !== undefined ? `${e.durationMs} ms` : esc(e.stage)}</span>
          ${e.detail ? `<span class="detail">${esc(e.detail)}</span>` : ""}
        </div>`,
      )
      .join("");
  }

  const counts = auditCounts();
  $("activity-meta").textContent = `${counts.total} call${counts.total === 1 ? "" : "s"}`;
  $("stat-calls").textContent = String(counts.total);
}

/* ------------------------- flow diagram animation ------------------------ */

function litFlow(on: boolean) {
  $("flow")
    .querySelectorAll(".flow-node")
    .forEach((n) => n.classList.toggle("lit", on));
}

setExecutionHook((name, phase) => {
  if (phase === "start") {
    running.add(name);
    litFlow(true);
  } else {
    running.delete(name);
    if (running.size === 0) setTimeout(() => litFlow(false), 500);
  }
  renderCapabilities();
});

/* ---------------------------- local test call ---------------------------- */

function refreshTestTools(granted: Capability[]) {
  const select = $<HTMLSelectElement>("test-tool");
  const current = select.value;
  select.innerHTML = granted.length
    ? granted.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("")
    : `<option value="">grant a capability first</option>`;
  if (granted.some((c) => c.name === current)) select.value = current;
  $<HTMLButtonElement>("test-run").disabled = granted.length === 0;
}

$("test-run").addEventListener("click", async () => {
  const name = $<HTMLSelectElement>("test-tool").value;
  const cap = capabilities.find((c) => c.name === name);
  if (!cap) return;

  const out = $<HTMLPreElement>("test-out");
  let args: Record<string, unknown> = {};
  const rawArgs = $<HTMLInputElement>("test-args").value.trim();
  if (rawArgs) {
    try {
      args = JSON.parse(rawArgs);
    } catch {
      out.hidden = false;
      out.textContent = "Arguments must be valid JSON.";
      return;
    }
  }

  out.hidden = false;
  out.textContent = "Running\u2026";

  // Calls the exact closure that was handed to registerTool. A human clicking
  // here and an agent calling the tool run the same function.
  try {
    const result = await invokeProjected(cap.name, args);
    out.textContent = typeof result === "string" ? formatJson(result) : JSON.stringify(result, null, 2);
  } catch (err: any) {
    out.textContent = `Error: ${err?.message ?? String(err)}`;
  }
  renderAll();
});

function formatJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

$("byo-connect").addEventListener("click", async () => {
  const urlInput = $<HTMLInputElement>("byo-url");
  const tokenInput = $<HTMLInputElement>("byo-token");
  const out = $<HTMLPreElement>("byo-out");
  const btn = $<HTMLButtonElement>("byo-connect");

  const url = urlInput.value.trim();
  if (!url) return;

  btn.disabled = true;
  out.hidden = false;
  out.textContent = "Connecting\u2026";

  try {
    const result = await connectSource(url, tokenInput.value.trim());
    if (!result.ok || !result.source || !result.capabilities) {
      out.textContent = result.error ?? "Could not connect to that capability source.";
      return;
    }

    // The token is gone from this page the moment we clear the field: from here
    // on we hold nothing but an opaque, expiring handle.
    tokenInput.value = "";

    sources = [...sources.filter((s) => s.id !== result.source!.id), result.source];
    capabilities = [
      ...capabilities.filter((c) => c.source.id !== result.source!.id),
      ...result.capabilities,
    ];

    out.textContent =
      `Connected to ${result.source.label}\n` +
      `${result.capabilities.length} capabilities discovered\n` +
      `Lease handle: ${result.source.id}\n` +
      `Expires in ${Math.round((result.expiresInSeconds ?? 0) / 60)} minutes`;

    renderAll();
  } catch (err: any) {
    out.textContent = `Error: ${err?.message ?? String(err)}`;
  } finally {
    btn.disabled = false;
  }
});

$("revoke-all").addEventListener("click", () => {
  projectedNames().forEach((name) => {
    const cap = capabilities.find((c) => c.name === name);
    if (cap) revokeCapability(cap);
  });
  renderAll();
});

/* --------------------------------- boot --------------------------------- */

function renderAll() {
  renderSources();
  renderCapabilities();
  renderLease();
}

async function boot() {
  renderWebMCPStatus();
  onAudit(renderActivity);

  try {
    const data: CapabilitiesResponse = await fetchCapabilities();
    sources = data.sources;
    capabilities = data.capabilities;
  } catch (err: any) {
    $("capabilities").innerHTML = `<div class="lease-empty">Discovery failed: ${esc(
      err?.message ?? err,
    )}</div>`;
  }

  renderAll();

  // The page holds exactly zero service credentials, and says so out loud.
  $("stat-credentials").textContent = "0";
}

boot();
