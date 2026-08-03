#!/usr/bin/env tsx
import { readFileSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, join as joinLocal, posix } from "node:path";
import { parseArgs } from "node:util";

import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { Sandbox } from "e2b";

// Operator-only escape hatch for uploading files/folders into a sandbox during manual debugging.
// Mirrors scripts/sandbox_exec.ts. Runtime app code must route sandbox file writes through
// SandboxProvider, not this script.

// Number of files written per batch. Bounds how much file data we hold in memory at once when
// uploading large folders, while still amortizing request overhead across many small files.
const UPLOAD_BATCH_SIZE = 25;

interface UploadEntry {
  localPath: string;
  remotePath: string;
}

// Recursively collect every file under `localDir`, mapping each to its destination under
// `remoteDir` (POSIX paths, since the sandbox is Linux).
async function collectDirEntries(
  localDir: string,
  remoteDir: string
): Promise<UploadEntry[]> {
  const dirents = await readdir(localDir, { withFileTypes: true });
  const entries: UploadEntry[] = [];

  for (const dirent of dirents) {
    const childLocal = joinLocal(localDir, dirent.name);
    const childRemote = posix.join(remoteDir, dirent.name);

    if (dirent.isDirectory()) {
      entries.push(...(await collectDirEntries(childLocal, childRemote)));
    } else if (dirent.isFile()) {
      entries.push({ localPath: childLocal, remotePath: childRemote });
    }
    // Symlinks, sockets, etc. are skipped: not meaningful to upload byte-for-byte.
  }

  return entries;
}

// Read a local file into a fresh ArrayBuffer (exact bytes, no extra slack from the Node Buffer
// pool) so the E2B SDK uploads it binary-safe.
function readFileAsArrayBuffer(path: string): ArrayBuffer {
  const buffer = readFileSync(path);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      sandboxId: { type: "string", short: "s" },
      // Sandbox user that owns the uploaded files and against which relative remote paths resolve.
      // Defaults to the agent workload user so uploaded files are usable by the sandbox workload
      // (and readable via `e2b sandbox exec`, which also runs as agent). Pass -u root to write to
      // root-only locations such as /etc.
      user: { type: "string", short: "u", default: "agent" },
    },
  });

  const sandboxId = values.sandboxId;
  const user = values.user;
  const [localPath, remotePath] = positionals;

  if (!sandboxId || !localPath || !remotePath) {
    logger.error(
      "Error: --sandboxId (-s), <localPath> and <remotePath> are required"
    );
    logger.error(
      "Usage: sandbox_upload.ts -s <sandbox-id> [-u <user>] <localPath> <remotePath>"
    );
    logger.error("  Upload a single file:");
    logger.error(
      "    sandbox_upload.ts -s <id> ./local.txt /home/agent/dest.txt"
    );
    logger.error(
      "    sandbox_upload.ts -s <id> ./local.txt /home/agent/    (keeps basename)"
    );
    logger.error("  Upload a folder (recursively):");
    logger.error("    sandbox_upload.ts -s <id> ./localdir /home/agent/dest");
    process.exit(1);
  }

  const stats = statSync(localPath);

  let entries: UploadEntry[];
  if (stats.isDirectory()) {
    entries = await collectDirEntries(localPath, remotePath);
  } else if (stats.isFile()) {
    // A trailing slash means "into this directory", so keep the local basename.
    const target = remotePath.endsWith("/")
      ? posix.join(remotePath, basename(localPath))
      : remotePath;
    entries = [{ localPath, remotePath: target }];
  } else {
    logger.error({ localPath }, "Local path is neither a file nor a directory");
    process.exit(1);
  }

  if (entries.length === 0) {
    logger.warn({ localPath }, "Nothing to upload (no files found)");
    process.exit(0);
  }

  logger.info(
    { sandboxId, user, fileCount: entries.length, remotePath },
    "Connecting to sandbox for upload"
  );

  const e2bConfig = config.getE2BSandboxConfig();
  const sandbox = await Sandbox.connect(sandboxId, {
    apiKey: e2bConfig.apiKey,
    domain: e2bConfig.domain,
  });

  let uploaded = 0;
  for (let i = 0; i < entries.length; i += UPLOAD_BATCH_SIZE) {
    const batch = entries.slice(i, i + UPLOAD_BATCH_SIZE);
    await sandbox.files.write(
      batch.map((entry) => ({
        path: entry.remotePath,
        data: readFileAsArrayBuffer(entry.localPath),
      })),
      { user }
    );
    uploaded += batch.length;
    logger.info({ uploaded, total: entries.length }, "Upload progress");
  }

  logger.info(
    { sandboxId, fileCount: uploaded, remotePath },
    "Upload complete"
  );
}

main().catch((err) => {
  logger.error({ err }, "Fatal error");
  process.exit(1);
});
