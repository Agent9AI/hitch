/**
 * Integration tests for the WebMCP projection.
 *
 * These run the real page against a spec-faithful WebMCP implementation
 * (tests/webmcp-shim.js) and assert the things a WebMCP-capable browser will
 * assert: that a grant registers a tool, that the tool's contract is the
 * source's contract, that invoking it returns a spec-valid response, and that
 * revoking it makes the tool cease to exist.
 *
 *   node --test tests/webmcp.test.mjs
 *   HITCH_URL=http://localhost:5173 node --test tests/webmcp.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.env.HITCH_URL ?? "https://hitch.agent9.dev";
const SHIM = path.join(path.dirname(fileURLToPath(import.meta.url)), "webmcp-shim.js");

let browser;
let page;

before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.addInitScript({ path: SHIM });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".cap", { timeout: 45000 });
});

after(async () => {
  await browser?.close();
});

const registered = () => page.evaluate(() => document.modelContext.getTools());

test("the page detects WebMCP when the host provides it", async () => {
  const pill = await page.textContent("#webmcp-pill");
  assert.match(pill, /WebMCP ready/i);
  assert.match(pill, /document\.modelContext/);
});

test("discovery is not permission: nothing is registered before a grant", async () => {
  assert.equal((await registered()).length, 0);

  const cards = await page.locator(".cap").count();
  assert.ok(cards >= 3, `expected discovered capabilities, saw ${cards}`);
});

test("granting a capability registers a real WebMCP tool", async () => {
  await page.click('button[data-grant="research_company"]');
  await page.waitForTimeout(300);

  const tools = await registered();
  const tool = tools.find((t) => t.name === "research_company");
  assert.ok(tool, "research_company should be registered");
  assert.ok(tool.description.length > 20, "the source's description should carry through");
});

test("the registered contract is the source's contract, not a rewrite", async () => {
  const tools = await registered();
  const { inputSchema } = tools.find((t) => t.name === "research_company");

  assert.equal(inputSchema.type, "object");
  assert.ok(inputSchema.properties.company, "the source's property should survive projection");
  assert.deepEqual(inputSchema.required, ["company"]);
});

test("an agent calling the tool gets a spec-valid response", async () => {
  // __webmcpCall validates the response shape against the specification and
  // throws if execute() returns anything else.
  const result = await page.evaluate(
    () => window.__webmcpCall("research_company", { company: "Cloudflare" }),
    null,
  );

  assert.ok(Array.isArray(result.content), "response must carry a content array");
  assert.equal(result.content[0].type, "text");
  assert.ok(result.content[0].text.length > 0);

  const payload = JSON.parse(result.content[0].text);
  assert.ok(payload.summary, "the capability's real result should reach the agent");
});

test("the call is recorded in the audit log", async () => {
  const log = await page.textContent("#activity");
  assert.match(log, /research_company/);
  assert.match(log, /\d+ ms/);
});

test("revoking aborts the lease and the tool ceases to exist", async () => {
  await page.click('button[data-grant="research_company"]');
  await page.waitForTimeout(300);

  const names = (await registered()).map((t) => t.name);
  assert.ok(!names.includes("research_company"), "revoked tool must be gone from getTools()");
});

test("a revoked capability cannot be invoked at all", async () => {
  await assert.rejects(
    () => page.evaluate(() => window.__webmcpCall("research_company", { company: "X" })),
    /no such tool/,
  );
});

test("a failing capability surfaces cleanly and is audited as failed", async () => {
  await page.click('button[data-grant="research_company"]');
  await page.waitForTimeout(300);

  // `company` is required by the source's schema. Omitting it must produce a
  // clean error, not an unhandled rejection or a broken page.
  await assert.rejects(
    () => page.evaluate(() => window.__webmcpCall("research_company", {})),
    /required|error/i,
    "a rejected call should reject the agent's promise",
  );

  const log = await page.textContent("#activity");
  assert.match(log, /failed|required/i, "the failure should appear in the audit log");

  // The page must still be alive and usable.
  assert.ok(await page.locator(".cap").count());
  const tools = await registered();
  assert.ok(
    tools.some((t) => t.name === "research_company"),
    "a failed call must not silently revoke the capability",
  );

  await page.click('button[data-grant="research_company"]');
  await page.waitForTimeout(300);
});

test("the demo set grants exactly the three capabilities the prompt needs", async () => {
  await page.click("#grant-demo");
  await page.waitForTimeout(600);

  const names = (await registered()).map((t) => t.name).sort();
  assert.deepEqual(names, [
    "create_project_task",
    "draft_launch_announcement",
    "research_company",
  ]);
});

test("the client bundle contains no capability endpoint and no credential", async () => {
  const bundle = await page.evaluate(async () => {
    const sources = [...document.querySelectorAll("script[src]")].map((s) => s.src);
    const texts = await Promise.all(sources.map((u) => fetch(u).then((r) => r.text())));
    return texts.join("\n");
  });

  // Cloudflare injects its own RUM beacon; everything else must be ours.
  const urls = [...new Set(bundle.match(/https?:\/\/[^\s"'`)]+/g) ?? [])].filter(
    (u) => !u.includes("cloudflareinsights.com"),
  );
  assert.deepEqual(urls, [], `client bundle should ship no absolute URLs, found: ${urls}`);

  assert.equal(bundle.match(/MCP_N8N|Bearer\s+[A-Za-z0-9]/g), null, "no token material");
  assert.ok(!bundle.includes("n8n.agent9.dev"), "the n8n endpoint must not reach the browser");
});

test("the page reports a real credential scan, not a hardcoded zero", async () => {
  const value = await page.textContent("#stat-credentials");
  const tooltip = await page.getAttribute("#stat-credentials", "title");
  assert.equal(value.trim(), "0");
  assert.match(tooltip, /scanned/i, "the number must come from an actual scan");
});

test("the guided tour drives the real controls, not a simulation", async () => {
  await page.click("#revoke-all");
  await page.waitForTimeout(300);

  await page.click("#tour-start");
  await page.waitForSelector(".tour-card", { timeout: 10000 });

  // Step through to the grant step.
  for (let i = 0; i < 4; i += 1) {
    await page.click('[data-tour="next"]');
    await page.waitForTimeout(1400);
  }

  // The tour clicked the real Grant control, so real tools must now be
  // registered with the WebMCP host.
  const names = (await registered()).map((t) => t.name).sort();
  assert.deepEqual(names, [
    "create_project_task",
    "draft_launch_announcement",
    "research_company",
  ]);

  const say = await page.textContent(".tour-say");
  assert.ok(say.length > 40, "each step should carry a line to say");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".tour-root.open").count(), 0, "Escape should exit the tour");
});

test("the tour script fits inside the three minute limit", async () => {
  const clock = await page.evaluate(async () => {
    document.getElementById("tour-start").click();
    await new Promise((r) => setTimeout(r, 900));
    const text = document.querySelector(".tour-clock").textContent;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    return text;
  });

  const total = clock.split("/")[1].trim();
  const [minutes, seconds] = total.split(":").map(Number);
  assert.ok(minutes * 60 + seconds < 180, `scripted runtime ${total} must be under 3:00`);
});

test("revoke all clears every lease at once", async () => {
  await page.click("#revoke-all");
  await page.waitForTimeout(400);
  assert.equal((await registered()).length, 0);
});
