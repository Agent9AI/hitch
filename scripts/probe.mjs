import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import fs from "node:fs";
const S = process.argv[2];
const url = `https://n8n.agent9.dev/mcp/${fs.readFileSync(S+"/n8n_path","utf8").trim()}`;
const token = fs.readFileSync(S+"/n8n_token","utf8").trim();
const c = new Client({ name: "probe", version: "1" });
await c.connect(new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { authorization: `Bearer ${token}` } } }));
const { tools } = await c.listTools();
console.log("DESC:", tools.find(t=>t.name==="geocode_place").description.slice(-260));
for (const args of [
  { input: JSON.stringify({ name: "Norfolk, Virginia" }) },
  { input: { name: "Norfolk, Virginia" } },
]) {
  try {
    const r = await c.callTool({ name: "geocode_place", arguments: args });
    console.log("\nARGS", JSON.stringify(args).slice(0,60), "->", JSON.stringify(r).slice(0, 260));
  } catch (e) { console.log("\nARGS", JSON.stringify(args).slice(0,60), "-> ERR", e.message.slice(0,120)); }
}
await c.close();
