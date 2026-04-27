import * as fs from "node:fs";

import {
  MAX_DIFF_BYTES,
  MAX_DIFF_LINES,
  MAX_EDIT_FILE_BYTES,
} from "../constants";
import type { Profile } from "../profile";
import { wantsHelp } from "../shared/args";
import { isBinary } from "../shared/binary";
import { error, errorWithUsage, ToolError } from "../shared/errors";
import { runCommandSync } from "../shared/exec";
import { countOutputLines, safeOutput } from "../shared/output";

const USAGE = "edit_file [--replace-all] <old_text> <new_text> <path>";

export const help = `edit_file - Replace text in a file

Usage: ${USAGE}

Options:
  --replace-all   Replace all occurrences (default: require unique match)`;

interface Outcome {
  readonly ok: boolean;
  readonly message: string;
  readonly diff: string;
}

const fail = (message: string): Outcome => ({ ok: false, message, diff: "" });

function runRequired(
  cmd: string,
  args: readonly string[],
  allow: readonly number[] = [0]
): { stdout: string; status: number } {
  const r = runCommandSync(cmd, args);
  if (r.error?.code === "ENOENT") {
    error(`${cmd} not installed`);
  }
  const status = r.status ?? 1;
  if (!allow.includes(status)) {
    error(r.stderr.trim() || `${cmd} failed`);
  }
  return { stdout: r.stdout, status };
}

function sdArgs(
  filePath: string,
  oldText: string,
  newText: string,
  replaceAll: boolean,
  preview: boolean
): string[] {
  return [
    ...(preview ? ["--preview"] : []),
    "-F",
    "-A",
    ...(replaceAll ? [] : ["-n", "1"]),
    "--",
    oldText,
    newText,
    filePath,
  ];
}

function truncateDiff(diff: string): string {
  const { text, wasTruncated } = safeOutput(diff, {
    maxBytes: MAX_DIFF_BYTES,
    maxLines: MAX_DIFF_LINES,
  });
  if (!wasTruncated) {
    return text;
  }
  const suffix = `[Diff truncated after ${countOutputLines(text)} lines. Byte budget: ${MAX_DIFF_BYTES}, line budget: ${MAX_DIFF_LINES}]`;
  return `${text}${text.endsWith("\n") ? "" : "\n"}${suffix}\n`;
}

function editOne(
  filePath: string,
  oldText: string,
  rawNewText: string,
  replaceAll: boolean
): Outcome {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return fail(`Error: file not found: ${filePath}`);
  }
  const { size } = fs.statSync(filePath);
  if (size === 0) {
    return fail(`Error: file is empty: ${filePath}`);
  }
  if (size > MAX_EDIT_FILE_BYTES) {
    return fail(`Error: file is too large to edit safely: ${filePath}`);
  }
  if (isBinary(filePath)) {
    return fail(
      `Error: binary file detected: ${filePath} (use write_file for binary files)`
    );
  }

  const newText = /\.(md|mdx)$/i.test(filePath)
    ? rawNewText
    : rawNewText.replace(/[ \t]+$/gm, "");

  const count = runRequired(
    "rg",
    ["--count-matches", "--fixed-strings", "-U", "-e", oldText, filePath],
    [0, 1]
  );
  const occurrences =
    count.status === 1 ? 0 : Number.parseInt(count.stdout.trim() || "0", 10);
  if (occurrences === 0) {
    return fail(`Error: old_text not found in ${filePath}`);
  }
  if (!replaceAll && occurrences > 1) {
    return fail(
      `Error: old_text matches ${occurrences} times in ${filePath}, must be unique (use --replace-all to replace all)`
    );
  }

  const modified = runRequired(
    "sd",
    sdArgs(filePath, oldText, newText, replaceAll, true)
  ).stdout;

  const tmp = `${filePath}.dust-tools.${process.pid}.tmp`;
  fs.writeFileSync(tmp, modified);
  let rawDiff: string;
  try {
    rawDiff = runRequired(
      "diff",
      ["-u", "--label", filePath, "--label", filePath, filePath, tmp],
      [0, 1]
    ).stdout;
  } finally {
    fs.rmSync(tmp, { force: true });
  }

  if (!rawDiff) {
    return fail(`Error: edit produced no changes in ${filePath}`);
  }
  const diff = truncateDiff(rawDiff);

  runRequired("sd", sdArgs(filePath, oldText, newText, replaceAll, false));
  return { ok: true, message: `Edited ${filePath}`, diff };
}

function writeLine(stream: NodeJS.WriteStream, text: string): void {
  stream.write(text);
  if (!text.endsWith("\n")) {
    stream.write("\n");
  }
}

export async function run(
  args: readonly string[],
  profile: Profile
): Promise<void> {
  if (profile === "openai") {
    error(
      "edit_file is not available for the openai profile; use apply_patch instead"
    );
  }
  if (wantsHelp(args)) {
    process.stdout.write(`${help}\n`);
    return;
  }
  if (args.length === 0) {
    errorWithUsage("arguments required", USAGE);
  }

  let replaceAll = false;
  let index = 0;
  while (index < args.length) {
    const arg = args[index] ?? "";
    if (arg === "--") {
      index += 1;
      break;
    }
    if (arg === "--replace-all") {
      replaceAll = true;
      index += 1;
      continue;
    }
    break;
  }

  const remaining = args.slice(index);
  if (remaining.length !== 3) {
    errorWithUsage("expected old_text, new_text, and path", USAGE);
  }
  const [oldText = "", newText = "", filePath = ""] = remaining;

  const outcome = editOne(filePath, oldText, newText, replaceAll);
  writeLine(outcome.ok ? process.stdout : process.stderr, outcome.message);
  if (outcome.diff) {
    writeLine(process.stderr, outcome.diff);
  }
  if (!outcome.ok) {
    throw new ToolError([]);
  }
}
