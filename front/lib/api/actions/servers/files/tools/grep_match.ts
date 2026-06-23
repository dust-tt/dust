export interface GrepMatchResult {
  matches: string[];
  // True when we stopped because we reached the maximum number of matches.
  matchCapped: boolean;
  // True when we stopped (or truncated a match) because we reached the output byte budget. This
  // guards against a single very long matched line (e.g. a one-line file) dumping its full content
  // into the model context.
  byteCapped: boolean;
}

// Shared by both `files` grep entry points (internal agent-loop server + remote MCP server).
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

export function formatGrepFooter({
  matchCount,
  matchCapped,
  byteCapped,
  maxMatches,
  maxBytes,
  catToolName,
}: {
  matchCount: number;
  matchCapped: boolean;
  byteCapped: boolean;
  maxMatches: number;
  maxBytes: number;
  catToolName: string;
}): string {
  if (byteCapped) {
    return `\n\n[Output truncated at ${maxBytes / 1024}KB. Use \`${catToolName}\` with a line offset to read specific sections.]`;
  }

  if (matchCapped) {
    return `\n\n[Showing first ${maxMatches} matches. Refine your pattern or use \`${catToolName}\` with a line offset to read a specific section.]`;
  }

  return `\n\n[${matchCount} match${matchCount === 1 ? "" : "es"} found]`;
}
