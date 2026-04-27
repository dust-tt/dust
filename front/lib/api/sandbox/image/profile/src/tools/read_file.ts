import * as fs from "node:fs";

import { DEFAULT_READ_LIMIT, MAX_OUTPUT_BYTES } from "../constants";
import type { Profile } from "../profile";
import { parseIntArg, wantsHelp } from "../shared/args";
import { isBinary } from "../shared/binary";
import { error, errorWithUsage } from "../shared/errors";
import { readFileWindow } from "../shared/stream";

const READ_FILE_USAGE_ANTHROPIC = "read_file <path> [offset] [limit]";
const READ_FILE_USAGE_GEMINI = "read_file <path> [start] [end]";

const READ_FILE_HELP_ANTHROPIC = `read_file - Read file with line numbers

Usage: ${READ_FILE_USAGE_ANTHROPIC}

Arguments:
  path    File to read (required)
  offset  First line to read, 1-indexed (default: 1)
  limit   Maximum number of lines to return (default: 2000)

Output format:
  Header:  [File: path | Lines: offset-end of totalLines]
  Body:    Numbered lines (format: '  N\\tcontent')`;

const READ_FILE_HELP_GEMINI = `read_file - Read file with line numbers

Usage: ${READ_FILE_USAGE_GEMINI}

Arguments:
  path   File to read (required)
  start  First line to read, 1-indexed (default: 1)
  end    Last line to read, inclusive (default: start + 1999)

Output format:
  Header:  [File: path | Lines: start-end of totalLines]
  Body:    Numbered lines (format: '  N\\tcontent')`;

export const help = READ_FILE_HELP_ANTHROPIC;

function getUsage(profile: Profile): string {
  return profile === "gemini"
    ? READ_FILE_USAGE_GEMINI
    : READ_FILE_USAGE_ANTHROPIC;
}

function getHelp(profile: Profile): string {
  return profile === "gemini"
    ? READ_FILE_HELP_GEMINI
    : READ_FILE_HELP_ANTHROPIC;
}

export async function run(
  args: readonly string[],
  profile: Profile
): Promise<void> {
  if (wantsHelp(args)) {
    process.stdout.write(`${getHelp(profile)}\n`);
    return;
  }

  if (args.length === 0) {
    errorWithUsage("path is required", getUsage(profile));
  }

  const filePath = args[0] ?? "";

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    error(`file not found: ${filePath}`);
  }

  if (isBinary(filePath)) {
    error(
      `binary file detected: ${filePath} (use shell to inspect binary files)`
    );
  }

  let offset = 1;
  let limit = DEFAULT_READ_LIMIT;

  if (profile === "gemini") {
    const start =
      args[1] !== undefined ? parseIntArg(args[1], "start", { minimum: 1 }) : 1;
    const end =
      args[2] !== undefined
        ? parseIntArg(args[2], "end", { minimum: 1 })
        : start + DEFAULT_READ_LIMIT - 1;

    if (end < start) {
      error(`end (${end}) must be >= start (${start})`);
    }

    offset = start;
    limit = end - start + 1;
  } else {
    offset =
      args[1] !== undefined
        ? parseIntArg(args[1], "offset", { minimum: 1 })
        : 1;
    limit =
      args[2] !== undefined
        ? parseIntArg(args[2], "limit", { minimum: 1 })
        : DEFAULT_READ_LIMIT;
  }

  const { lines, totalLines } = await readFileWindow({
    filePath,
    startLine: offset,
    maxLines: limit,
    byteBudget: MAX_OUTPUT_BYTES,
  });

  const outputLines: string[] = [];
  let byteCount = 0;
  let lineNumber = offset;

  for (const line of lines) {
    const formatted = `     ${lineNumber}\t${line}`;
    const lineBytes = Buffer.byteLength(`${formatted}\n`, "utf8");

    if (byteCount + lineBytes > MAX_OUTPUT_BYTES && outputLines.length > 0) {
      break;
    }

    outputLines.push(formatted);
    byteCount += lineBytes;
    lineNumber += 1;
  }

  const actualEnd =
    outputLines.length > 0 ? offset + outputLines.length - 1 : offset;
  const header = `[File: ${filePath} | Lines: ${offset}-${actualEnd} of ${totalLines}]`;

  process.stdout.write(`${header}\n`);
  if (outputLines.length > 0) {
    process.stdout.write(`${outputLines.join("\n")}\n`);
  }
}
