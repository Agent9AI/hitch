import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import fs from "node:fs";
const S = process.argv[2];
const c = new Client({ name: "t", version: "1" });
await c.connect(new StreamableHTTPClientTransport(
  new URL(`https://n8n.agent9.dev/mcp/${fs.readFileSync(S+"/n8n_path","utf8").trim()}`),
  { requestInit: { headers: { authorization: `Bearer ${fs.readFileSync(S+"/n8n_token","utf8").trim()}` } } }));
const { tools } = await c.listTools();
const t = tools.find(x => x.name === "check_air_quality");
console.log("RAW SCHEMA:", JSON.stringify(t.inputSchema));
console.log("DESC TAIL:\n" + JSON.stringify(t.description.slice(-330)));
await c.close();
