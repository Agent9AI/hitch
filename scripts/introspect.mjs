import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import fs from "node:fs";
const S = process.argv[2];
const url = `https://n8n.agent9.dev/mcp/${fs.readFileSync(S+"/n8n_path","utf8").trim()}`;
const token = fs.readFileSync(S+"/n8n_token","utf8").trim();
const client = new Client({ name: "introspect", version: "1" });
await client.connect(new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { authorization: `Bearer ${token}` } },
}));
const { tools } = await client.listTools();
for (const t of tools) {
  console.log("TOOL:", t.name);
  console.log("  schema:", JSON.stringify(t.inputSchema));
}
console.log("\n--- calling geocode_place ---");
try {
  const r = await client.callTool({ name: "geocode_place", arguments: { place: "Norfolk, Virginia" } });
  console.log(JSON.stringify(r).slice(0, 400));
} catch (e) { console.log("ERR", e.message); }
await client.close();
