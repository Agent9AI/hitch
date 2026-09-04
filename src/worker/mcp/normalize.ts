/**
 * Normalises an MCP `tools/call` result into something a WebMCP tool can
 * return to a browser agent, without discarding the original response.
 */
export interface NormalizedResult {
  ok: boolean;
  /** Best-effort structured payload, when the source provided one. */
  data?: unknown;
  /** Flattened text content blocks, joined. */
  text: string;
  /** The untouched MCP result, so nothing is lost. */
  raw: unknown;
}

export function normalizeMcpResult(result: any): NormalizedResult {
  const blocks: any[] = Array.isArray(result?.content) ? result.content : [];

  const text = blocks
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n")
    .trim();

  let data = result?.structuredContent;
  if (data === undefined && text) {
    // Many sources return JSON inside a text block. Surface it if it parses.
    try {
      data = JSON.parse(text);
    } catch {
      /* plain prose result, leave `data` undefined */
    }
  }

  return {
    ok: result?.isError !== true,
    data,
    text,
    raw: result,
  };
}
