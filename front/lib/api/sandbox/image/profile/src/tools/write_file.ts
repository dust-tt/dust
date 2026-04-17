import * as fs from "node:fs";
import * as path from "node:path";

import type { Profile } from "../profile";
import { wantsHelp } from "../shared/args";
import { error, errorWithUsage } from "../shared/errors";

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
): Promise<void> {
  if (wantsHelp(args)) {
    process.stdout.write(`${help}\n`);
    return;
  }

  if (args.length === 0) {
    errorWithUsage("path is required", WRITE_FILE_USAGE);
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
    error(
      `failed to write ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
  process.stdout.write(
    `Wrote ${filePath} (${Buffer.byteLength(content, "utf8")} bytes)\n`
  );
}
