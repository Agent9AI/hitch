/**
 * Credential leak check.
 *
 * "The page never receives your credentials" is the central claim Hitch makes,
 * so the page should not simply assert it. This scans everything the bridge
 * actually sent the browser and counts anything that looks like a credential or
 * a capability-source address.
 *
 * It is a real check over real data. If the bridge ever started leaking an
 * endpoint or a token into a discovery response, this number would stop being
 * zero and the interface would say so.
 */

const SECRET_KEY = /(token|secret|password|passwd|apikey|api_key|credential|authorization|bearer|private_key)/i;
const ENDPOINT_KEY = /^(url|endpoint|uri|href|host|origin|server)$/i;
const URL_VALUE = /\bhttps?:\/\/[^\s"']+/i;

/** Values that are legitimately URL-shaped and are not capability endpoints. */
const ALLOWED_URL = /^https?:\/\/(en\.wikipedia\.org|json-schema\.org|www\.w3\.org)/i;

export interface LeakReport {
  count: number;
  findings: string[];
}

export function scanForCredentials(payload: unknown): LeakReport {
  const findings: string[] = [];

  const walk = (node: unknown, path: string) => {
    if (node === null || node === undefined) return;

    if (typeof node === "string") {
      const match = node.match(URL_VALUE);
      if (match && !ALLOWED_URL.test(match[0])) {
        findings.push(`${path}: ${match[0].slice(0, 60)}`);
      }
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }

    if (typeof node === "object") {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        const here = path ? `${path}.${key}` : key;

        if (SECRET_KEY.test(key)) {
          findings.push(`${here}: a credential-shaped field`);
          continue;
        }
        // A description may legitimately mention a URL; an `url` field is an address.
        if (ENDPOINT_KEY.test(key) && typeof value === "string" && value) {
          findings.push(`${here}: ${String(value).slice(0, 60)}`);
          continue;
        }
        walk(value, here);
      }
    }
  };

  walk(payload, "");
  return { count: findings.length, findings };
}
