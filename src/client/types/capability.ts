export type CapabilityRisk = "read" | "generate" | "write" | "spend" | "dangerous";

export interface CapabilitySource {
  id: string;
  label: string;
  blurb: string;
  online: boolean;
  count: number;
  error?: string;
}

export interface Capability {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  risk: CapabilityRisk;
  source: { id: string; label: string; type: "mcp" };
}

export interface CapabilitiesResponse {
  sources: CapabilitySource[];
  capabilities: Capability[];
  discoveredAt: string;
}

export type CapabilityState = "available" | "projected" | "executing" | "success" | "error";
