import * as fs from "node:fs";
import * as path from "node:path";

import { normalizeError } from "@app/types/shared/utils/error_utils";

import type { Profile } from "../profile";
import { usageError, wantsHelp } from "../shared/args";

const WRITE_FILE_USAGE = "write_file <path> <content>";

export const help = `write_file - Write content to file (atomic, creates parent directories)

Usage: ${WRITE_FILE_USAGE}

Arguments:
  path     File path to write to (required)
  content  Content to write (can be empty)

Output: "Wrote <path> (<bytes> bytes)" on success`;

export async function run(
  args: readonly string[],
  _profile: Profile
): Promise<number> {
  if (wantsHelp(args)) {
    process.stdout.write(`${help}\n`);
    return 0;
  }

  if (args.length === 0) {
    usageError("path is required", WRITE_FILE_USAGE);
  }

  const filePath = args[0] ?? "";
  const content = args[1] ?? "";
  const dirPath = path.dirname(path.resolve(filePath));

  fs.mkdirSync(dirPath, { recursive: true });

  const tempDir = fs.mkdtempSync(path.join(dirPath, ".write_file_"));
  const tempPath = path.join(tempDir, path.basename(filePath));

  try {
    fs.writeFileSync(tempPath, content, "utf8");
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw new Error(
      `failed to write ${filePath}: ${normalizeError(err).message}`
    );
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
  process.stdout.write(
    `Wrote ${filePath} (${Buffer.byteLength(content, "utf8")} bytes)\n`
  );
  return 0;
}
