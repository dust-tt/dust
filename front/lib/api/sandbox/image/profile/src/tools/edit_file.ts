import * as fs from "node:fs";

import { createTwoFilesPatch } from "diff";

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

const EDIT_FILE_USAGE_ANTHROPIC =
  "edit_file [--replace-all] <old_text> <new_text> <path>";
const EDIT_FILE_USAGE_GEMINI =
  "edit_file [--replace-all] [--dry-run] <old_text> <new_text> <path1> [path2]...";

const EDIT_FILE_HELP_ANTHROPIC = `edit_file - Replace text in a file

Usage: ${EDIT_FILE_USAGE_ANTHROPIC}

Options:
  --replace-all   Replace all occurrences instead of requiring uniqueness

Arguments:
  old_text    Exact text to find (required)
  new_text    Replacement text (can be empty for deletion)
  path        File to edit (required, single file only)

Notes:
  - Matching is exact-only.
  - Files larger than 50 MB are rejected.`;

const EDIT_FILE_HELP_GEMINI = `edit_file - Replace text in files, returns unified diff

Usage: ${EDIT_FILE_USAGE_GEMINI}

Options:
  --replace-all   Replace all occurrences instead of requiring uniqueness
  --dry-run       Preview changes as unified diff without writing

Arguments:
  old_text    Exact text to find (required)
  new_text    Replacement text (can be empty for deletion)
  path1...    One or more files to edit (required)

Notes:
  - Matching is exact-only.
  - Files larger than 50 MB are rejected.`;

export const help = EDIT_FILE_HELP_ANTHROPIC;

interface EditResult {
  readonly diffOutput: string;
  readonly exitCode: number;
  readonly message: string;
}

function getUsage(profile: Profile): string {
  return profile === "anthropic"
    ? EDIT_FILE_USAGE_ANTHROPIC
    : EDIT_FILE_USAGE_GEMINI;
}

function getHelp(profile: Profile): string {
  return profile === "anthropic"
    ? EDIT_FILE_HELP_ANTHROPIC
    : EDIT_FILE_HELP_GEMINI;
}

function stripTrailingWhitespace(text: string): string {
  return text.replace(/[ \t]+$/gm, "");
}

function countOccurrences(content: string, searchText: string): number {
  if (!searchText) {
    return 0;
  }

  let count = 0;
  let startIndex = 0;

  while (true) {
    const index = content.indexOf(searchText, startIndex);
    if (index === -1) {
      return count;
    }

    count += 1;
    startIndex = index + 1;
  }
}

function replaceFirst(
  content: string,
  searchText: string,
  replacementText: string
): string {
  const index = content.indexOf(searchText);
  if (index === -1) {
    return content;
  }

  return (
    content.slice(0, index) +
    replacementText +
    content.slice(index + searchText.length)
  );
}

function applyReplacement(
  content: string,
  searchText: string,
  replacementText: string,
  replaceAll: boolean
): string {
  if (replaceAll) {
    return content.split(searchText).join(replacementText);
  }

  return replaceFirst(content, searchText, replacementText);
}

function getDeleteTarget(content: string, oldText: string): string {
  if (oldText.endsWith("\n")) {
    return oldText;
  }

  const candidate = `${oldText}\n`;
  return content.includes(candidate) ? candidate : oldText;
}

function makeDiff(
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
  const diff = rawDiff.replace(/^\\ No newline at end of file\r?\n/gm, "");

  const notes: string[] = [];
  if (original.length > 0 && !original.endsWith("\n")) {
    notes.push("[No trailing newline in original file]");
  }
  if (modified.length > 0 && !modified.endsWith("\n")) {
    notes.push("[No trailing newline in updated file]");
  }

  if (notes.length === 0) {
    return diff;
  }

  return `${diff}${diff.endsWith("\n") ? "" : "\n"}${notes.join("\n")}\n`;
}

function truncateDiffOutput(diffOutput: string): string {
  const { text, wasTruncated } = safeOutput(diffOutput, {
    maxBytes: MAX_DIFF_BYTES,
    maxLines: MAX_DIFF_LINES,
  });

  if (!wasTruncated) {
    return text;
  }

  const suffix = `[Diff truncated after ${countOutputLines(text)} lines. Byte budget: ${MAX_DIFF_BYTES}, line budget: ${MAX_DIFF_LINES}]`;

  return `${text}${text.endsWith("\n") ? "" : "\n"}${suffix}\n`;
}

function writeToStream(stream: NodeJS.WriteStream, text: string): void {
  stream.write(text);
  if (!text.endsWith("\n")) {
    stream.write("\n");
  }
}

function applySdEdit(
  filePath: string,
  searchText: string,
  replacementText: string,
  replaceAll: boolean
): void {
  const args = ["-F", "-A"];

  if (!replaceAll) {
    args.push("-n", "1");
  }

  args.push("--", searchText, replacementText, filePath);

  const result = runCommandSync("sd", args);
  if (result.error?.code === "ENOENT") {
    error("sd not installed");
  }

  if (result.status !== 0) {
    error(result.stderr.trim() || `failed to edit ${filePath}`);
  }
}

function editOneFile(
  filePath: string,
  oldText: string,
  newText: string,
  replaceAll: boolean,
  isMarkdown: boolean,
  dryRun: boolean
): EditResult {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return {
      diffOutput: "",
      exitCode: 1,
      message: `Error: file not found: ${filePath}`,
    };
  }

  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    return {
      diffOutput: "",
      exitCode: 1,
      message: `Error: file is empty: ${filePath}`,
    };
  }

  if (stat.size > MAX_EDIT_FILE_BYTES) {
    return {
      diffOutput: "",
      exitCode: 1,
      message: `Error: file is too large to edit safely: ${filePath}`,
    };
  }

  if (isBinary(filePath)) {
    return {
      diffOutput: "",
      exitCode: 1,
      message: `Error: binary file detected: ${filePath} (use write_file for binary files)`,
    };
  }

  const original = fs.readFileSync(filePath, "utf8");
  const effectiveNewText = isMarkdown
    ? newText
    : stripTrailingWhitespace(newText);

  if (!original.includes(oldText)) {
    return {
      diffOutput: "",
      exitCode: 1,
      message: `Error: old_text not found in ${filePath}`,
    };
  }

  const occurrences = countOccurrences(original, oldText);
  if (!replaceAll && occurrences > 1) {
    return {
      diffOutput: "",
      exitCode: 1,
      message: `Error: old_text matches ${occurrences} times in ${filePath}, must be unique (use --replace-all to replace all)`,
    };
  }

  const searchText =
    effectiveNewText === "" ? getDeleteTarget(original, oldText) : oldText;
  const modified = applyReplacement(
    original,
    searchText,
    effectiveNewText,
    replaceAll
  );

  if (modified === original) {
    return {
      diffOutput: "",
      exitCode: 1,
      message: `Error: edit produced no changes in ${filePath}`,
    };
  }

  const diffOutput = truncateDiffOutput(makeDiff(filePath, original, modified));

  if (dryRun) {
    return {
      diffOutput,
      exitCode: 0,
      message: `Preview for ${filePath}`,
    };
  }

  try {
    applySdEdit(filePath, searchText, effectiveNewText, replaceAll);
  } catch (err) {
    if (err instanceof ToolError) {
      return {
        diffOutput: "",
        exitCode: err.exitCode,
        message: err.lines[0] ?? `Error: failed to edit ${filePath}`,
      };
    }

    return {
      diffOutput: "",
      exitCode: 1,
      message: `Error: failed to edit ${filePath}`,
    };
  }

  return {
    diffOutput,
    exitCode: 0,
    message: `Edited ${filePath}`,
  };
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
    process.stdout.write(`${getHelp(profile)}\n`);
    return;
  }

  if (args.length === 0) {
    errorWithUsage("arguments required", getUsage(profile));
  }

  let dryRun = false;
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
    if (profile === "gemini" && arg === "--dry-run") {
      dryRun = true;
      index += 1;
      continue;
    }
    break;
  }

  const remaining = args.slice(index);
  if (remaining.length < 3) {
    errorWithUsage(
      "old_text, new_text, and at least one path are required",
      getUsage(profile)
    );
  }

  const oldText = remaining[0] ?? "";
  const newText = remaining[1] ?? "";
  const paths = remaining.slice(2);

  if (profile === "anthropic" && paths.length > 1) {
    error("edit_file supports one file at a time");
  }

  let failed = false;

  for (const filePath of paths) {
    const result = editOneFile(
      filePath,
      oldText,
      newText,
      replaceAll,
      /\.(md|mdx)$/i.test(filePath),
      dryRun
    );

    if (result.exitCode !== 0) {
      writeToStream(process.stderr, result.message);
      failed = true;
      continue;
    }

    writeToStream(process.stdout, result.message);
    if (result.diffOutput) {
      writeToStream(
        dryRun ? process.stdout : process.stderr,
        result.diffOutput
      );
    }
  }

  if (failed) {
    throw new ToolError([]);
  }
}
