import * as fs from "node:fs";
import * as path from "node:path";

import { DEFAULT_LIST_LIMIT } from "../constants";
import type { Profile } from "../profile";
import { parseIntArg, parseToolArgs, wantsHelp } from "../shared/args";
import { errorWithUsage } from "../shared/errors";
import { paginate, printPaginatedOutput } from "../shared/output";

const GLOB_USAGE = "glob <pattern> [--path PATH] [--offset N] [--limit N]";

export const help = `glob - Find files by glob pattern

Usage: ${GLOB_USAGE}

Arguments:
  pattern    Glob pattern, e.g., "*.py", "**/*.ts" (required)

Options:
  --path     Directory to search (default: .)
  --offset   Skip first N results for pagination (default: 0)
  --limit    Max results to return (default: 200)`;

function normalizePathForGlob(filePath: string): string {
  return filePath.split(path.sep).join(path.posix.sep);
}

function matchesPattern(relativePath: string, pattern: string): boolean {
  const normalizedPath = normalizePathForGlob(relativePath);

  if (path.matchesGlob(normalizedPath, pattern)) {
    return true;
  }

  if (!pattern.includes("/") && !pattern.includes(path.sep)) {
    return path.matchesGlob(path.posix.basename(normalizedPath), pattern);
  }

  return false;
}

function collectMatches(pattern: string, searchPath: string): string[] {
  if (!fs.existsSync(searchPath)) {
    return [];
  }

  const stat = fs.lstatSync(searchPath);

  if (!stat.isDirectory()) {
    return matchesPattern(path.basename(searchPath), pattern)
      ? [searchPath]
      : [];
  }

  return fs
    .globSync("**/*", {
      cwd: searchPath,
      withFileTypes: false,
    })
    .filter((relativePath) => {
      const fullPath = path.join(searchPath, relativePath);
      const entry = fs.lstatSync(fullPath);
      return entry.isFile() || entry.isSymbolicLink();
    })
    .filter((relativePath) => matchesPattern(relativePath, pattern))
    .map((relativePath) =>
      searchPath === "." ? relativePath : path.join(searchPath, relativePath)
    )
    .sort();
}

export async function run(
  args: readonly string[],
  _profile: Profile
): Promise<void> {
  if (wantsHelp(args)) {
    process.stdout.write(`${help}\n`);
    return;
  }

  const { values, positionals } = parseToolArgs(args, {
    path: { type: "string" },
    offset: { type: "string" },
    limit: { type: "string" },
  });

  if (positionals.length === 0) {
    errorWithUsage("pattern is required", GLOB_USAGE);
  }

  const pattern = positionals[0] ?? "";
  const searchPath = values.path ?? positionals[1] ?? ".";
  const offset = parseIntArg(values.offset ?? "0", "--offset", { minimum: 0 });
  const limit = parseIntArg(
    values.limit ?? `${DEFAULT_LIST_LIMIT}`,
    "--limit",
    { minimum: 1 }
  );

  const matches = collectMatches(pattern, searchPath);
  const { page, hasMore } = paginate(matches, offset, limit);

  printPaginatedOutput(page, offset, hasMore);
}
