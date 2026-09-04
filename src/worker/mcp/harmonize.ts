/**
 * Capability harmonisation.
 *
 * Not every MCP source publishes a clean contract. n8n, for example, advertises
 * every HTTP Request Tool as a single opaque property:
 *
 *   inputSchema: { type: "object", properties: { input: { type: "string" } } }
 *   description: "...Tool expects valid stringified JSON object with 2 properties.
 *                 Property names with description, type and required status:
 *                 latitude: (description: Latitude in decimal degrees., type: number, required: true)
 *                 longitude: (...)"
 *
 * The real schema is there, but it is prose, and an agent handed that contract
 * has to guess at a stringified blob.
 *
 * A capability layer should not pass that through. It should present the agent
 * a proper contract and absorb the source's quirk on the way back out. So this
 * module recovers the schema, cleans the description, and records that the
 * source needs its arguments re-wrapped at call time.
 */
import type { DiscoveredTool } from "./client";

/** Where n8n's generated schema prose begins. */
const BLURB = /Tool expects valid stringified JSON object[\s\S]*$/i;

/**
 * `name: (description: ..., type: ..., required: true)`
 *
 * The description capture must not cross a newline: properties are emitted one
 * per line but separated by a trailing comma, so a newline-crossing capture
 * happily swallows the next property into the previous one's description.
 */
const PROPERTY =
  /([A-Za-z_][\w-]*)\s*:\s*\(description:\s*(.*?),\s*type:\s*(\w+),\s*required:\s*(true|false)\s*\)/g;

const JSON_TYPES = new Set(["string", "number", "integer", "boolean", "object", "array"]);

export interface HarmonizedTool extends DiscoveredTool {
  /** True when the source expects `{ input: "<stringified JSON>" }`. */
  wrapsArguments: boolean;
}

/** Does this look like the opaque single-string contract? */
function isOpaqueStringContract(schema: Record<string, any> | undefined): boolean {
  const properties = schema?.properties;
  if (!properties || typeof properties !== "object") return false;
  const keys = Object.keys(properties);
  return keys.length === 1 && keys[0] === "input" && properties.input?.type === "string";
}

/**
 * Recover a real JSON Schema from the description prose.
 * Returns null when there is nothing parseable, in which case the original
 * contract is left exactly as the source published it.
 */
function schemaFromDescription(description: string): Record<string, unknown> | null {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  PROPERTY.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PROPERTY.exec(description)) !== null) {
    const [, name, rawDescription, rawType, rawRequired] = match;
    const type = JSON_TYPES.has(rawType) ? rawType : "string";
    properties[name] = {
      type,
      description: rawDescription.trim().replace(/\s+/g, " ").replace(/\.$/, "") + ".",
    };
    if (rawRequired === "true") required.push(name);
  }

  if (Object.keys(properties).length === 0) return null;

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

/**
 * Present one discovered tool as a clean capability contract.
 */
export function harmonizeTool(tool: DiscoveredTool): HarmonizedTool {
  const description = tool.description ?? "";

  if (!isOpaqueStringContract(tool.inputSchema) || !BLURB.test(description)) {
    return { ...tool, wrapsArguments: false };
  }

  const recovered = schemaFromDescription(description);
  if (!recovered) return { ...tool, wrapsArguments: false };

  return {
    ...tool,
    description: description.replace(BLURB, "").trim(),
    inputSchema: recovered,
    wrapsArguments: true,
  };
}

/** Arguments as the source wants to receive them. */
export function wrapArguments(
  args: Record<string, unknown>,
  wrapsArguments: boolean,
): Record<string, unknown> {
  return wrapsArguments ? { input: JSON.stringify(args) } : args;
}
