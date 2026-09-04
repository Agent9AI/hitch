import type { CapabilitiesResponse } from "../types/capability";

/**
 * The only two calls the browser makes. Both are same-origin. Neither carries
 * a credential, because the browser does not have one to carry.
 */

export async function fetchCapabilities(): Promise<CapabilitiesResponse> {
  const response = await fetch("/api/capabilities", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Discovery failed with HTTP ${response.status}`);
  return response.json();
}

export interface ExecuteResponse {
  ok: boolean;
  tool: string;
  source: string;
  durationMs: number;
  data?: unknown;
  text?: string;
  raw?: unknown;
  error?: string;
}

export async function executeCapability(
  source: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<ExecuteResponse> {
  const response = await fetch("/api/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source, tool, arguments: args }),
  });
  const data = (await response.json()) as ExecuteResponse;
  if (!response.ok && !data?.error) {
    throw new Error(`Execution failed with HTTP ${response.status}`);
  }
  return data;
}

export interface ConnectResponse {
  ok: boolean;
  error?: string;
  source?: import("../types/capability").CapabilitySource;
  capabilities?: import("../types/capability").Capability[];
  expiresInSeconds?: number;
}

/**
 * Attach a capability source the user owns.
 *
 * The URL and any token go to the bridge once. The bridge validates them,
 * stores them behind an expiring handle, and returns only that handle. The
 * page never keeps the credential.
 */
export async function connectSource(url: string, token?: string): Promise<ConnectResponse> {
  const response = await fetch("/api/connect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, token: token || undefined }),
  });
  return response.json();
}
