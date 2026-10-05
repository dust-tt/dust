import { DEFAULT_GREP_MAX_RESULTS } from "../constants";
import type { Profile } from "../profile";
import {
  parseIntArg,
  parseToolArgs,
  usageError,
  wantsHelp,
} from "../shared/args";
import { runCommandSync } from "../shared/exec";
import { paginate, printPaginatedOutput } from "../shared/output";

const USAGE =
  "grep_files <pattern> [--glob GLOB] [--path PATH] [--max-results N] [--max-per-file N] [--context N] [--offset N] [--output-mode content|files|count] [--case-insensitive] [--max-line-length N]";

export const help = `grep_files - Recursively search files for a regex pattern using ripgrep

Usage: ${USAGE}

Arguments:
  pattern             Regex pattern to search for (required)

Options:
  --glob              File glob filter, e.g., "*.py"
  --path              Directory to search recursively (default: .)
  --max-results       Max total matches to return (default: 200)
  --max-per-file      Max matches per file (passed to rg --max-count)
  --context           Lines before/after each match (default: 0)
  --offset            Skip first N result lines for pagination (default: 0)
  --output-mode       content (default), files, count          [anthropic only]
  --case-insensitive  Case-insensitive search                   [anthropic only]
  --max-line-length   Max chars per output line (default: 500)  [anthropic only]`;

type OutputMode = "content" | "files" | "count";

const isOutputMode = (v: string): v is OutputMode =>
  v === "content" || v === "files" || v === "count";

export async function run(
  args: readonly string[],
  profile: Profile
): Promise<number> {
  if (wantsHelp(args)) {
    process.stdout.write(`${help}\n`);
    return 0;
  }

  const { values, positionals } = parseToolArgs(args, {
    context: { type: "string" },
    glob: { type: "string" },
    "max-per-file": { type: "string" },
    "max-results": { type: "string" },
    offset: { type: "string" },
    path: { type: "string" },
    ...(profile === "anthropic" && {
      "case-insensitive": { type: "boolean" },
      "max-line-length": { type: "string" },
      "output-mode": { type: "string" },
    }),
  });

  if (positionals.length === 0) {
    usageError("pattern is required", USAGE);
  }
  const pattern = positionals[0] ?? "";

  const outputMode = values["output-mode"] ?? "content";
  if (typeof outputMode !== "string" || !isOutputMode(outputMode)) {
    throw new Error(
      `invalid value for --output-mode: ${JSON.stringify(outputMode)} (expected content, files, or count)`
    );
  }

  const offset = parseIntArg(values.offset ?? "0", "--offset", { minimum: 0 });
  const maxResults = parseIntArg(
    values["max-results"] ?? `${DEFAULT_GREP_MAX_RESULTS}`,
    "--max-results",
    { minimum: 1 }
  );
  const contextLines = parseIntArg(values.context ?? "0", "--context", {
    minimum: 0,
  });

  const rgArgs: string[] = ["--color=never"];
  if (outputMode === "files") {
    rgArgs.push("--files-with-matches");
  } else if (outputMode === "count") {
    rgArgs.push("--count");
  } else {
    rgArgs.push("-n");
  }
  if (profile === "anthropic" && values["case-insensitive"]) {
    rgArgs.push("-i");
  }
  if (values.glob) {
    rgArgs.push("--glob", values.glob);
  }
  if (values["max-per-file"] !== undefined) {
    const n = parseIntArg(values["max-per-file"], "--max-per-file", {
      minimum: 1,
    });
    rgArgs.push("--max-count", `${n}`);
  }
  if (contextLines > 0) {
    rgArgs.push("-C", `${contextLines}`);
  }
  if (profile === "anthropic" && outputMode === "content") {
    const maxLineLengthRaw = values["max-line-length"];
    const maxLineLength = parseIntArg(
      typeof maxLineLengthRaw === "string" ? maxLineLengthRaw : "500",
      "--max-line-length",
      { minimum: 1 }
    );
    rgArgs.push("--max-columns", `${maxLineLength}`);
  }
  rgArgs.push("--sort=path", "-e", pattern, values.path ?? ".");

  const result = runCommandSync("rg", rgArgs);
  if (result.error?.code === "ENOENT") {
    throw new Error("rg not installed");
  }
  if (result.status === 2) {
    throw new Error(result.stderr.trim() || "grep failed");
  }

  const lines = result.stdout.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  const { page, hasMore } = paginate(lines, offset, maxResults);

  if (page.length > 0) {
    printPaginatedOutput(page, offset, hasMore);
  } else if (result.status === 1) {
    process.stdout.write("No matches found.\n");
  }

  return 0;
}
