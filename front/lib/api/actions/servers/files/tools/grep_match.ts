export interface GrepMatchResult {
  matches: string[];
  // True when we stopped because we reached the maximum number of matches.
  matchCapped: boolean;
  // True when we stopped (or truncated a match) because we reached the output byte budget. This
  // guards against a single very long matched line (e.g. a one-line file) dumping its full content
  // into the model context.
  byteCapped: boolean;
}

// Collects `${lineNumber}: ${line}` for lines matching `regex`, bounded by both a match count and a
// total output byte budget. Shared by the `files` MCP server's grep tools so the two entry points
// stay in sync. Mirrors the `cat` tool's byte budget.
export async function collectGrepMatches({
  lines,
  regex,
  maxMatches,
  maxBytes,
}: {
  lines: AsyncIterable<string>;
  regex: RegExp;
  maxMatches: number;
  maxBytes: number;
}): Promise<GrepMatchResult> {
  const matches: string[] = [];
  let lineNumber = 0;
  let matchCapped = false;
  let byteCapped = false;
  let byteCount = 0;

  for await (const line of lines) {
    lineNumber++;

    if (!regex.test(line)) {
      continue;
    }

    const match = `${lineNumber}: ${line}`;
    const matchBytes = Buffer.byteLength(`${match}\n`, "utf8");

    if (byteCount + matchBytes > maxBytes) {
      // Always return something: if the very first match already exceeds the budget, byte-slice it.
      if (matches.length === 0) {
        matches.push(
          Buffer.from(match, "utf8").slice(0, maxBytes).toString("utf8")
        );
      }
      byteCapped = true;
      break;
    }

    matches.push(match);
    byteCount += matchBytes;

    if (matches.length >= maxMatches) {
      matchCapped = true;
      break;
    }
  }

  return { matches, matchCapped, byteCapped };
}
