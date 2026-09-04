/**
 * Inspect any MCP capability source from the command line.
 *
 * Shows what a source advertises, and what Hitch would project into WebMCP
 * after harmonisation, which is the quickest way to see whether a source
 * publishes a usable contract.
 *
 *   node scripts/inspect-mcp.mjs https://example.com/mcp
 *   MCP_TOKEN=... node scripts/inspect-mcp.mjs https://example.com/mcp
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.argv[2];
if (!url) {
  console.error("usage: node scripts/inspect-mcp.mjs <mcp-url>   (MCP_TOKEN optional)");
  process.exit(1);
}

const headers = {};
if (process.env.MCP_TOKEN) headers.authorization = `Bearer ${process.env.MCP_TOKEN}`;

const client = new Client({ name: "hitch-inspect", version: "0.1.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }),
);

const { tools } = await client.listTools();
console.log(`${tools.length} capabilities at ${url}\n`);

for (const tool of tools) {
  console.log(`  ${tool.name}`);
  console.log(`    ${(tool.description ?? "").split("\n")[0].slice(0, 100)}`);
  console.log(`    schema: ${JSON.stringify(tool.inputSchema)}\n`);
}

await client.close();
