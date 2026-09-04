/**
 * Captures the README hero image against the live site.
 * Grants the demo set, runs two real capability calls, then screenshots.
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SHIM = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tests", "webmcp-shim.js");

const out = process.argv[2] ?? "docs/hero.png";
const browser = await chromium.launch();
const page = await browser.newPage({ viewportSize: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
// Headless Chromium has no WebMCP, so the capture runs against the same
// spec-faithful implementation the test suite uses. The screenshot therefore
// shows real registered tools, not a mock-up of them.
await page.addInitScript({ path: SHIM });
await page.goto("https://hitch.agent9.dev", { waitUntil: "networkidle" });
await page.waitForSelector(".cap", { timeout: 30000 });

await page.click("#grant-demo");
await page.waitForTimeout(600);

async function run(tool, args) {
  await page.selectOption("#test-tool", tool);
  await page.fill("#test-args", JSON.stringify(args));
  await page.click("#test-run");
  await page.waitForTimeout(4500);
}

await run("research_company", { company: "Anthropic" });
await run("create_project_task", {
  title: "Record the Hitch demo",
  description: "Capture the two minute WebMCP walkthrough.",
});

await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: true });
console.log("captured", out);
await browser.close();
