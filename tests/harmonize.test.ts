/**
 * Unit tests for capability harmonisation.
 * Run with: node --experimental-strip-types --test tests/harmonize.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { harmonizeTool, wrapArguments } from "../src/worker/mcp/harmonize.ts";

/** A real n8n HTTP Request Tool contract, copied verbatim from tools/list. */
const N8N_TOOL = {
  name: "check_air_quality",
  description:
    "Check current outdoor air quality at a latitude and longitude. Returns the US AQI plus " +
    "PM2.5 and PM10 concentrations.\n\nTool expects valid stringified JSON object with 2 properties.\n" +
    "Property names with description, type and required status:\n" +
    "latitude: (description: Latitude in decimal degrees., type: number, required: true),\n" +
    " longitude: (description: Longitude in decimal degrees., type: number, required: true)\n" +
    "ALL parameters marked as required must be provided",
  inputSchema: {
    type: "object",
    properties: { input: { type: "string" } },
    additionalProperties: true,
  },
};

test("recovers a typed schema from an opaque string contract", () => {
  const result = harmonizeTool(N8N_TOOL as any);

  assert.equal(result.wrapsArguments, true);
  assert.deepEqual(result.inputSchema, {
    type: "object",
    properties: {
      latitude: { type: "number", description: "Latitude in decimal degrees." },
      longitude: { type: "number", description: "Longitude in decimal degrees." },
    },
    required: ["latitude", "longitude"],
    additionalProperties: false,
  });
});

test("does not let one property's description swallow the next", () => {
  const { inputSchema } = harmonizeTool(N8N_TOOL as any);
  const properties = (inputSchema as any).properties;
  assert.equal(Object.keys(properties).length, 2);
  assert.ok(!properties.latitude.description.includes("longitude"));
});

test("strips the generated schema prose from the description", () => {
  const { description } = harmonizeTool(N8N_TOOL as any);
  assert.ok(!description!.includes("stringified JSON"));
  assert.ok(description!.startsWith("Check current outdoor air quality"));
});

test("leaves a well formed contract completely untouched", () => {
  const clean = {
    name: "research_company",
    description: "Research an organization and return a concise factual summary.",
    inputSchema: {
      type: "object",
      properties: { company: { type: "string", description: "Company to research." } },
      required: ["company"],
      additionalProperties: false,
    },
  };
  const result = harmonizeTool(clean as any);
  assert.equal(result.wrapsArguments, false);
  assert.deepEqual(result.inputSchema, clean.inputSchema);
  assert.equal(result.description, clean.description);
});

test("leaves an opaque contract alone when the prose is unparseable", () => {
  const vague = {
    name: "mystery",
    description: "Does something. Tool expects valid stringified JSON object with 1 properties.",
    inputSchema: { type: "object", properties: { input: { type: "string" } } },
  };
  const result = harmonizeTool(vague as any);
  assert.equal(result.wrapsArguments, false);
  assert.deepEqual(result.inputSchema, vague.inputSchema);
});

test("wraps arguments only for sources that need it", () => {
  assert.deepEqual(wrapArguments({ latitude: 1, longitude: 2 }, true), {
    input: '{"latitude":1,"longitude":2}',
  });
  assert.deepEqual(wrapArguments({ company: "Anthropic" }, false), { company: "Anthropic" });
});
