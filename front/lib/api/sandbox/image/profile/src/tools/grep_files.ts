import { DEFAULT_GREP_MAX_RESULTS } from "../constants";
import type { Profile } from "../profile";
import { parseIntArg, wantsHelp } from "../shared/args";
import { error, errorWithUsage } from "../shared/errors";
import { runCommandSync } from "../shared/exec";
import { paginate, printPaginatedOutput } from "../shared/output";

const GREP_USAGE_BASE =
  "grep_files <pattern> [--glob GLOB] [--path PATH] [--max-results N] [--max-per-file N] [--context N] [--offset N]";
const GREP_USAGE_ANTHROPIC = `${GREP_USAGE_BASE} [--output-mode content|files|count] [--case-insensitive] [--max-line-length N]`;

const GREP_HELP_BASE = `grep_files - Search files for regex pattern using ripgrep

Usage: %USAGE%

Arguments:
  pattern           Regex pattern to search for (required)

Options:
  --glob            File glob filter, e.g., "*.py"
  --path            Directory to search (default: .)
  --max-results     Max total matches to return (default: 200)
  --max-per-file    Max matches per file (passed to rg --max-count)
  --context         Lines before/after each match (default: 0)
  --offset          Skip first N result lines for pagination (default: 0)`;

const GREP_HELP_ANTHROPIC_EXTRA = `
  --output-mode     Output mode: content (default), files, count
  --case-insensitive  Case-insensitive search
  --max-line-length Max chars per output line (clips long lines, default: 500)`;

export const help = GREP_HELP_BASE.replace("%USAGE%", GREP_USAGE_ANTHROPIC);

type OutputMode = "content" | "files" | "count";

interface ParsedGrepArgs {
  readonly caseInsensitive: boolean;
  readonly contextLines: number;
  readonly fileGlob?: string;
  readonly maxLineLength?: number;
  readonly maxPerFile?: number;
  readonly maxResults: number;
  readonly offset: number;
  readonly outputMode: OutputMode;
  readonly pattern: string;
  readonly searchPath: string;
}

function getUsage(profile: Profile): string {
  return profile === "anthropic" ? GREP_USAGE_ANTHROPIC : GREP_USAGE_BASE;
}

function getHelp(profile: Profile): string {
  const base = GREP_HELP_BASE.replace("%USAGE%", getUsage(profile));
  return profile === "anthropic" ? `${base}${GREP_HELP_ANTHROPIC_EXTRA}` : base;
}

function parseGrepArgs(
  args: readonly string[],
  profile: Profile
): ParsedGrepArgs {
  const allFlags = new Set([
    "context",
    "glob",
    "max-per-file",
    "max-results",
    "offset",
    "path",
  ]);

  if (profile === "anthropic") {
    allFlags.add("max-line-length");
    allFlags.add("output-mode");
  }

  const positional: string[] = [];
  const named: Record<string, string> = {};

  for (let index = 0; index < args.length; ) {
    const arg = args[index] ?? "";

    if (arg === "--") {
      positional.push(...args.slice(index + 1));
      break;
    }

    if (positional.length === 0) {
      if (profile === "anthropic" && arg === "--case-insensitive") {
        named["case-insensitive"] = "true";
        index += 1;
        continue;
      }

      if (arg.startsWith("--")) {
        const key = arg.slice(2);
        if (allFlags.has(key)) {
          const value = args[index + 1];
          if (value === undefined) {
            error(`--${key} requires a value`);
          }
          named[key] = value;
          index += 2;
          continue;
        }
      }

      positional.push(arg);
      index += 1;
      continue;
    }

    if (profile === "anthropic" && arg === "--case-insensitive") {
      named["case-insensitive"] = "true";
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (!allFlags.has(key)) {
        error(`unknown flag: ${arg}`);
      }

      const value = args[index + 1];
      if (value === undefined) {
        error(`--${key} requires a value`);
      }

      named[key] = value;
      index += 2;
      continue;
    }

    positional.push(arg);
    index += 1;
  }

  if (positional.length === 0) {
    errorWithUsage("pattern is required", getUsage(profile));
  }

  const outputMode = (named["output-mode"] ?? "content") as OutputMode;
  if (!["content", "count", "files"].includes(outputMode)) {
    error(
      `invalid value for --output-mode: ${JSON.stringify(
        outputMode
      )} (expected content, files, or count)`
    );
  }

  return {
    caseInsensitive: named["case-insensitive"] === "true",
    contextLines: parseIntArg(named.context ?? "0", "--context", {
      minimum: 0,
    }),
    fileGlob: named.glob,
    maxLineLength:
      profile === "anthropic"
        ? parseIntArg(named["max-line-length"] ?? "500", "--max-line-length", {
            minimum: 1,
          })
        : undefined,
    maxPerFile:
      named["max-per-file"] !== undefined
        ? parseIntArg(named["max-per-file"], "--max-per-file", { minimum: 1 })
        : undefined,
    maxResults: parseIntArg(
      named["max-results"] ?? `${DEFAULT_GREP_MAX_RESULTS}`,
      "--max-results",
      { minimum: 1 }
    ),
    offset: parseIntArg(named.offset ?? "0", "--offset", { minimum: 0 }),
    outputMode,
    pattern: positional[0] ?? "",
    searchPath: named.path ?? ".",
  };
}

function splitLines(text: string): string[] {
  if (!text) {
    return [];
  }

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

export async function run(
  args: readonly string[],
  profile: Profile
): Promise<void> {
  if (wantsHelp(args)) {
    process.stdout.write(`${getHelp(profile)}\n`);
    return;
  }

  const parsed = parseGrepArgs(args, profile);

  const rgArgs = ["--color=never"];
  switch (parsed.outputMode) {
    case "files":
      rgArgs.push("--files-with-matches");
      break;
    case "count":
      rgArgs.push("--count");
      break;
    case "content":
      rgArgs.push("-n");
      break;
  }

  if (parsed.caseInsensitive) {
    rgArgs.push("-i");
  }

  if (parsed.fileGlob) {
    rgArgs.push("--glob", parsed.fileGlob);
  }

  if (parsed.maxPerFile !== undefined) {
    rgArgs.push("--max-count", `${parsed.maxPerFile}`);
  }

  if (parsed.contextLines > 0) {
    rgArgs.push("-C", `${parsed.contextLines}`);
  }

  if (parsed.outputMode === "content" && parsed.maxLineLength !== undefined) {
    rgArgs.push("--max-columns", `${parsed.maxLineLength}`);
  }

  rgArgs.push("--sort=path", "-e", parsed.pattern, parsed.searchPath);

  const result = runCommandSync("rg", rgArgs);
  if (result.error?.code === "ENOENT") {
    error("rg not installed");
  }

  if (result.status === 2) {
    error(result.stderr.trim() || "grep failed");
  }

  const lines = splitLines(result.stdout);
  const { page, hasMore } = paginate(lines, parsed.offset, parsed.maxResults);

  if (page.length > 0) {
    printPaginatedOutput(page, parsed.offset, hasMore, "results");
    return;
  }

  if (result.status === 1) {
    process.stdout.write("No matches found.\n");
  }
}
