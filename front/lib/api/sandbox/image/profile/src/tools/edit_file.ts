import * as fs from "node:fs";

import { createTwoFilesPatch } from "diff";

import {
  MAX_DIFF_BYTES,
  MAX_DIFF_LINES,
  MAX_EDIT_FILE_BYTES,
} from "../constants";
import type { Profile } from "../profile";
import { usageError, wantsHelp } from "../shared/args";
import { isBinary } from "../shared/binary";
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

function countOccurrences(content: string, search: string): number {
  if (!search) {
    return 0;
  }
  let count = 0;
  let from = 0;
  while (true) {
    const index = content.indexOf(search, from);
    if (index === -1) {
      return count;
    }
    count += 1;
    from = index + search.length;
  }
}

function applyReplacement(
  content: string,
  search: string,
  replacement: string,
  replaceAll: boolean
): string {
  if (replaceAll) {
    return content.split(search).join(replacement);
  }
  const index = content.indexOf(search);
  if (index === -1) {
    return content;
  }
  return (
    content.slice(0, index) + replacement + content.slice(index + search.length)
  );
}

function buildDiff(
  filePath: string,
  original: string,
  modified: string
): string {
  const rawDiff = createTwoFilesPatch(
    filePath,
    filePath,
    original,
    modified,
    "",
    "",
    { context: 4 }
  );
  return rawDiff.replace(/^Index: .*\n=+\n/, "");
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
  newText: string,
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

  const original = fs.readFileSync(filePath, "utf8");
  const occurrences = countOccurrences(original, oldText);
  if (occurrences === 0) {
    return fail(`Error: old_text not found in ${filePath}`);
  }
  if (!replaceAll && occurrences > 1) {
    return fail(
      `Error: old_text matches ${occurrences} times in ${filePath}, must be unique (use --replace-all to replace all)`
    );
  }

  const modified = applyReplacement(original, oldText, newText, replaceAll);
  if (modified === original) {
    return fail(`Error: edit produced no changes in ${filePath}`);
  }

  const diff = truncateDiff(buildDiff(filePath, original, modified));
  fs.writeFileSync(filePath, modified);
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
): Promise<number> {
  if (profile === "openai") {
    usageError(
      "edit_file is not available for the openai profile; use apply_patch instead",
      USAGE
    );
  }
  if (wantsHelp(args)) {
    process.stdout.write(`${help}\n`);
    return 0;
  }
  if (args.length === 0) {
    usageError("arguments required", USAGE);
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
    usageError("expected old_text, new_text, and path", USAGE);
  }
  const [oldText = "", newText = "", filePath = ""] = remaining;

  const outcome = editOne(filePath, oldText, newText, replaceAll);
  writeLine(outcome.ok ? process.stdout : process.stderr, outcome.message);
  if (outcome.diff) {
    writeLine(process.stderr, outcome.diff);
  }
  return outcome.ok ? 0 : 1;
}
