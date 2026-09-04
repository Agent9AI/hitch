/** Renders the social preview card to public/og.png (1200x630). */
import { chromium } from "playwright";

const html = `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;background:#08090c;color:#e8ecf3;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;
    padding:70px 76px;display:flex;flex-direction:column;justify-content:space-between;
    background-image:radial-gradient(ellipse 760px 460px at 8% -12%,rgba(74,222,128,.13),transparent),
      radial-gradient(ellipse 700px 440px at 96% 8%,rgba(86,182,255,.10),transparent)}
  .mark{font-size:23px;font-weight:700;letter-spacing:.15em;text-transform:uppercase}
  .mark span{color:#4ade80}
  h1{font-size:74px;line-height:1.03;letter-spacing:-.035em;font-weight:700;max-width:19ch}
  h1 em{font-style:normal;color:#4ade80}
  p{margin-top:24px;font-size:25px;line-height:1.42;color:#939cad;max-width:33ch}
  .row{display:flex;gap:12px;align-items:center}
  .chip{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:15px;letter-spacing:.06em;
    padding:9px 16px;border:1px solid #2a3140;border-radius:999px;color:#939cad}
  .chip.on{color:#4ade80;border-color:#16341f}
  .url{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:19px;color:#626b7c;margin-left:auto}
</style>
<div class="row"><div class="mark">Hit<span>ch</span></div></div>
<div>
  <h1>Your capabilities.<br>Your agent. <em>Your control.</em></h1>
  <p>WebMCP in reverse. Bring tools you already own to any page, without handing it your credentials.</p>
</div>
<div class="row">
  <span class="chip on">MCP</span>
  <span class="chip">capability layer</span>
  <span class="chip on">WebMCP</span>
  <span class="url">hitch.agent9.dev</span>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(html, { waitUntil: "load" });
await page.screenshot({ path: "src/client/public/og.png", clip: { x: 0, y: 0, width: 1200, height: 630 } });
console.log("wrote src/client/public/og.png");
await browser.close();
