/**
 * Guard for user-supplied capability sources.
 *
 * "Connect your own MCP server" means the bridge will make an outbound request
 * to a URL a stranger typed. That is a server-side request forgery primitive
 * unless it is constrained, so it is constrained here, in one place, before any
 * connection is attempted.
 */

/** Literal hosts that must never be reachable through the bridge. */
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
]);

/** Private, loopback, link-local and carrier-grade NAT ranges. */
const BLOCKED_IPV4 =
  /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

export interface GuardResult {
  ok: boolean;
  url?: URL;
  error?: string;
}

export function guardSourceUrl(raw: string): GuardResult {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "That is not a valid URL." };
  }

  // HTTPS only: the token a user pastes must never travel in the clear.
  if (url.protocol !== "https:") {
    return { ok: false, error: "Capability sources must be served over HTTPS." };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTS.has(host)) {
    return { ok: false, error: "That host is not reachable from the bridge." };
  }

  // Block private address space, so the bridge cannot be used to probe
  // whatever network it happens to be running in.
  if (BLOCKED_IPV4.test(host)) {
    return { ok: false, error: "Private network addresses are not allowed." };
  }
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
    return { ok: false, error: "Private network addresses are not allowed." };
  }
  if (host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) {
    return { ok: false, error: "Only publicly resolvable hostnames are allowed." };
  }

  return { ok: true, url };
}

/** Bearer tokens for user-supplied sources are accepted per-request and are
 *  never written to storage or logs. */
export function sanitizeToken(token: unknown): string | undefined {
  if (typeof token !== "string") return undefined;
  const trimmed = token.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 4096) return undefined;
  // Header-injection safety.
  if (/[\r\n]/.test(trimmed)) return undefined;
  return trimmed;
}
