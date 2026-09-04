import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("https://hitch.agent9.dev", { waitUntil: "networkidle" });
await p.waitForSelector(".cap", { timeout: 40000 });
console.log("credential stat:", await p.textContent("#stat-credentials"));
console.log("label:", (await p.textContent("#stat-credentials")) && await p.evaluate(() =>
  document.getElementById("stat-credentials").parentElement.querySelector(".l").textContent));
console.log("tooltip:", await p.getAttribute("#stat-credentials", "title"));
// Also prove the bundle contains no endpoint
const js = await p.evaluate(async () => {
  const src = [...document.querySelectorAll("script[src]")].map(s => s.src);
  const texts = await Promise.all(src.map(u => fetch(u).then(r => r.text())));
  return texts.join("\n");
});
const hits = js.match(/https?:\/\/[^\s"'`)]+/g) || [];
console.log("URLs in client bundle:", [...new Set(hits)].join(", ") || "(none)");
console.log("token-ish strings in bundle:", (js.match(/Bearer\s+\S|MCP_N8N|workers\.dev/gi) || []).join(", ") || "(none)");
await b.close();
