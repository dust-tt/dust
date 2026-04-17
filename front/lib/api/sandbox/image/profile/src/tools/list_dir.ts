import * as fs from "node:fs";
import * as path from "node:path";

import {
  DEFAULT_LIST_DIR_DEPTH,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_DIR_DEPTH,
} from "../constants";
import type { Profile } from "../profile";
import { parseIntArg, parseNamedArgs, wantsHelp } from "../shared/args";
import { error } from "../shared/errors";
import { paginate, printPaginatedOutput } from "../shared/output";

const LIST_DIR_USAGE = "list_dir [path] [--depth N] [--offset N] [--limit N]";

export const help = `list_dir - List directory contents with type indicators

Usage: ${LIST_DIR_USAGE}

Arguments:
  path      Directory to list (default: .)

Options:
  --depth   Max depth to recurse (default: 2, max: 5)
  --offset  Skip first N results for pagination (default: 0)
  --limit   Max results to return (default: 200)`;

function collectEntries(dirPath: string, maxDepth: number): string[] {
  const entries: string[] = [];

  const visitChildren = (parentPath: string, entryDepth: number): void => {
    const dirents = fs.readdirSync(parentPath, { withFileTypes: true });

    for (const dirent of dirents) {
      const fullPath = path.join(parentPath, dirent.name);
      const isSymlink = dirent.isSymbolicLink();
      const isDirectory = dirent.isDirectory() && !isSymlink;
      const suffix = isSymlink ? "@" : isDirectory ? "/" : "";

      entries.push(`${fullPath}${suffix}`);

      if (isDirectory && entryDepth < maxDepth) {
        visitChildren(fullPath, entryDepth + 1);
      }
    }
  };

  visitChildren(dirPath, 1);
  return entries.sort();
}

export async function run(
  args: readonly string[],
  _profile: Profile
): Promise<void> {
  if (wantsHelp(args)) {
    process.stdout.write(`${help}\n`);
    return;
  }

  const { positional, named } = parseNamedArgs(args, [
    "depth",
    "offset",
    "limit",
  ]);

  const dirPath = positional[0] ?? ".";
  const depth = Math.min(
    parseIntArg(named.depth ?? `${DEFAULT_LIST_DIR_DEPTH}`, "--depth", {
      minimum: 0,
    }),
    MAX_LIST_DIR_DEPTH
  );
  const offset = parseIntArg(named.offset ?? "0", "--offset", { minimum: 0 });
  const limit = parseIntArg(named.limit ?? `${DEFAULT_LIST_LIMIT}`, "--limit", {
    minimum: 1,
  });

  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    error(`directory not found: ${dirPath}`);
  }

  const entries = collectEntries(dirPath, depth);
  const { page, hasMore } = paginate(entries, offset, limit);

  printPaginatedOutput(page, offset, hasMore, "entries");
}
