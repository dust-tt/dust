// Cache management for dust-hive
// Uses local repo as cache source, with fallback to build from scratch

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { directoryExists, fileExists } from "./fs";
import { logger } from "./logger";
import { DUST_HIVE_HOME } from "./paths";
import { buildShell } from "./shell";

// Cache directory structure
export const CACHE_DIR = join(DUST_HIVE_HOME, "cache");
export const CACHE_SOURCE_PATH = join(CACHE_DIR, "source.path");
export const SYNC_STATE_PATH = join(CACHE_DIR, "sync-state.json");

// Sync state schema for validation
const SyncStateSchema = z.object({
  npm: z.object({
    "sdks/js": z.string().optional(),
    front: z.string().optional(),
    connectors: z.string().optional(),
  }),
  bun: z.string().optional(),
  lastCommit: z.string().optional(),
});

// Sync state tracks what was last synced to detect changes
export type SyncState = z.infer<typeof SyncStateSchema>;

// Get current sync state from disk (returns null if missing or invalid)
export async function getSyncState(): Promise<SyncState | null> {
  if (!(await fileExists(SYNC_STATE_PATH))) {
    return null;
  }
  const content = await Bun.file(SYNC_STATE_PATH).text();
  const parseResult = SyncStateSchema.safeParse(JSON.parse(content));
  return parseResult.success ? parseResult.data : null;
}

// Save sync state to disk
export async function saveSyncState(state: SyncState): Promise<void> {
  await ensureCacheDir();
  await Bun.write(SYNC_STATE_PATH, JSON.stringify(state, null, 2));
}

// Compute SHA256 hash of a file (returns null if file doesn't exist)
export async function hashFile(path: string): Promise<string | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return null;
  }
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(await file.arrayBuffer());
  return hasher.digest("hex");
}

// Check if core/ directory changed between two commits
export async function coreChangedBetweenCommits(
  repoRoot: string,
  oldCommit: string,
  newCommit: string
): Promise<boolean> {
  const proc = Bun.spawn(["git", "diff", "--quiet", oldCommit, newCommit, "--", "core/"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  // Exit code 0 = no diff, 1 = has diff
  return proc.exitCode !== 0;
}

// Get current HEAD commit SHA
export async function getHeadCommit(repoRoot: string): Promise<string | null> {
  const proc = Bun.spawn(["git", "rev-parse", "HEAD"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  if (proc.exitCode !== 0) {
    return null;
  }
  return stdout.trim();
}

// Binaries needed for initialization
export const INIT_BINARIES = [
  "qdrant_create_collection",
  "elasticsearch_create_index",
  "init_db",
] as const;

// Binaries needed for running services
export const SERVICE_BINARIES = ["core-api", "oauth", "sqlite-worker"] as const;

// All binaries
export const ALL_BINARIES = [...INIT_BINARIES, ...SERVICE_BINARIES] as const;

export type InitBinary = (typeof INIT_BINARIES)[number];
export type ServiceBinary = (typeof SERVICE_BINARIES)[number];
export type Binary = (typeof ALL_BINARIES)[number];

// Ensure cache directory exists
async function ensureCacheDir(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
}

// Get the cache source path (main Dust repo)
export async function getCacheSource(): Promise<string | null> {
  if (!(await fileExists(CACHE_SOURCE_PATH))) {
    return null;
  }
  const content = await Bun.file(CACHE_SOURCE_PATH).text();
  const path = content.trim();
  if (!(await directoryExists(path))) {
    return null;
  }
  return path;
}

// Set the cache source path
export async function setCacheSource(repoRoot: string): Promise<void> {
  await ensureCacheDir();
  await Bun.write(CACHE_SOURCE_PATH, repoRoot);
}

// Get the path to a binary in the cache source
export function getBinaryPath(cacheSource: string, binary: Binary): string {
  return join(cacheSource, "core", "target", "debug", binary);
}

// Check if a binary exists in the cache source
export async function binaryExists(cacheSource: string, binary: Binary): Promise<boolean> {
  const path = getBinaryPath(cacheSource, binary);
  return await fileExists(path);
}

// Check which binaries are available in cache
export async function getAvailableBinaries(cacheSource: string): Promise<Binary[]> {
  const available: Binary[] = [];
  for (const binary of ALL_BINARIES) {
    if (await binaryExists(cacheSource, binary)) {
      available.push(binary);
    }
  }
  return available;
}

// Check which binaries are missing from cache
export async function getMissingBinaries(cacheSource: string): Promise<Binary[]> {
  const missing: Binary[] = [];
  for (const binary of ALL_BINARIES) {
    if (!(await binaryExists(cacheSource, binary))) {
      missing.push(binary);
    }
  }
  return missing;
}

// Build missing binaries
export async function buildBinaries(
  cacheSource: string,
  binaries: Binary[]
): Promise<{ success: boolean; built: Binary[]; failed: Binary[] }> {
  const built: Binary[] = [];
  const failed: Binary[] = [];

  if (binaries.length === 0) {
    return { success: true, built, failed };
  }

  logger.step(`Building ${binaries.length} binaries...`);

  // Build all at once using cargo build
  const binFlags = binaries.flatMap((b) => ["--bin", b]);
  const command = buildShell({
    run: ["cargo", "build", ...binFlags].join(" "),
  });

  const proc = Bun.spawn(["bash", "-c", command], {
    cwd: join(cacheSource, "core"),
    stdout: "pipe",
    stderr: "pipe",
  });

  await proc.exited;

  if (proc.exitCode === 0) {
    // Verify each binary was built
    for (const binary of binaries) {
      if (await binaryExists(cacheSource, binary)) {
        built.push(binary);
      } else {
        failed.push(binary);
      }
    }
  } else {
    // Build failed, all are failed
    failed.push(...binaries);
  }

  if (built.length > 0) {
    logger.success(`Built: ${built.join(", ")}`);
  }
  if (failed.length > 0) {
    logger.warn(`Failed to build: ${failed.join(", ")}`);
  }

  return { success: failed.length === 0, built, failed };
}
