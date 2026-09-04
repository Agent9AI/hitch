/**
 * Capability risk classification.
 *
 * Risk is deliberately NOT inferred by a model. It is derived from MCP tool
 * annotations where the source provides them, then narrowed by an explicit
 * local mapping. Anything unknown falls back to the most restrictive sensible
 * value, so a new tool appearing at a source can never quietly present itself
 * as harmless.
 */

export type CapabilityRisk = "read" | "generate" | "write" | "spend" | "dangerous";

export const RISK_LABEL: Record<CapabilityRisk, string> = {
  read: "READ",
  generate: "GENERATIVE",
  write: "WRITE",
  spend: "SPEND",
  dangerous: "DANGEROUS",
};

/** Explicit overrides for capabilities we have reviewed by hand. */
const RISK_OVERRIDES: Record<string, CapabilityRisk> = {
  research_company: "read",
  list_project_tasks: "read",
  draft_launch_announcement: "generate",
  create_project_task: "write",
  // n8n capability source
  geocode_place: "read",
  check_air_quality: "read",
  get_weather_forecast: "read",
};

const READ_HINTS = /^(get|list|read|search|find|lookup|fetch|query|check|research|summar)/i;
const GENERATE_HINTS = /^(draft|generate|write_copy|compose|create_text|summarise|summarize)/i;
const DANGEROUS_HINTS = /(delete|destroy|drop|remove|purge|revoke|wipe)/i;
const SPEND_HINTS = /(pay|purchase|charge|invoice|order|checkout|transfer_funds)/i;

export function classifyRisk(
  name: string,
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean },
): CapabilityRisk {
  const override = RISK_OVERRIDES[name];
  if (override) return override;

  if (DANGEROUS_HINTS.test(name) || annotations?.destructiveHint === true) return "dangerous";
  if (SPEND_HINTS.test(name)) return "spend";
  if (annotations?.readOnlyHint === true) return "read";
  if (GENERATE_HINTS.test(name)) return "generate";
  if (READ_HINTS.test(name)) return "read";

  // Be conservative: an unclassified capability is treated as a writer.
  return "write";
}
