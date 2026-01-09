import { mkdir, readdir, rm } from "node:fs/promises";
import { z } from "zod";
import { createTypeGuard } from "./errors";
import { directoryExists } from "./fs";
import { detectEnvFromCwd, DUST_HIVE_ENVS, getEnvDir, getInitializedMarkerPath, getMetadataPath } from "./paths";
import type { PortAllocation } from "./ports";
import { loadPortAllocation } from "./ports";

const EnvironmentMetadataFields = z.object({
  name: z.string(),
  baseBranch: z.string(),
  workspaceBranch: z.string(),
  createdAt: z.string(),
  repoRoot: z.string(),
});

export const EnvironmentMetadataSchema = EnvironmentMetadataFields.passthrough();

export type EnvironmentMetadata = z.infer<typeof EnvironmentMetadataFields>;

export const isEnvironmentMetadata =
  createTypeGuard<EnvironmentMetadata>(EnvironmentMetadataSchema);

export interface Environment {
  name: string;
  slug: string; // name with "/" replaced by "-", safe for file paths, Docker, Zellij, etc.
  metadata: EnvironmentMetadata;
  ports: PortAllocation;
  initialized: boolean;
}

// Convert environment name to a slug safe for file paths, Docker, Zellij, etc.
// Replaces "/" with "-" to flatten hierarchical names.
export function getEnvSlug(name: string): string {
  return name.replace(/\//g, "-");
}

// Validate environment name
export function validateEnvName(name: string): { valid: boolean; error?: string } {
  if (!name) {
    return { valid: false, error: "Name is required" };
  }

  // Allow lowercase letters, numbers, hyphens, and forward slashes
  // Must start with a letter, cannot have consecutive slashes or end with slash
  if (!/^[a-z][a-z0-9/-]*$/.test(name)) {
    return {
      valid: false,
      error:
        "Name must start with a letter and contain only lowercase letters, numbers, hyphens, and slashes",
    };
  }

  // No consecutive slashes
  if (/\/\//.test(name)) {
    return { valid: false, error: "Name cannot contain consecutive slashes" };
  }

  // Cannot end with slash
  if (name.endsWith("/")) {
    return { valid: false, error: "Name cannot end with a slash" };
  }

  // Zellij has a 36-character session name limit. Since session names are
  // formatted as "dust-hive-{slug}" (10-char prefix), slug must be ≤26 chars.
  const slug = getEnvSlug(name);
  if (slug.length > 26) {
    return { valid: false, error: "Name must be 26 characters or less" };
  }

  return { valid: true };
}

// Check if environment exists
export async function environmentExists(name: string): Promise<boolean> {
  const metadataPath = getMetadataPath(name);
  const file = Bun.file(metadataPath);
  return file.exists();
}

// Create environment directory and save metadata
export async function createEnvironment(metadata: EnvironmentMetadata): Promise<void> {
  const envDir = getEnvDir(metadata.name);
  await mkdir(envDir, { recursive: true });
  await saveMetadata(metadata);
}

// Save environment metadata
export async function saveMetadata(metadata: EnvironmentMetadata): Promise<void> {
  const path = getMetadataPath(metadata.name);
  await Bun.write(path, JSON.stringify(metadata, null, 2));
}

// Load environment metadata
export async function loadMetadata(name: string): Promise<EnvironmentMetadata | null> {
  const path = getMetadataPath(name);
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return null;
  }

  const data: unknown = await file.json();

  if (isEnvironmentMetadata(data)) {
    return data;
  }

  return null;
}

// Check if environment has been initialized (DB setup done)
export async function isInitialized(name: string): Promise<boolean> {
  const path = getInitializedMarkerPath(name);
  const file = Bun.file(path);
  return file.exists();
}

// Mark environment as initialized
export async function markInitialized(name: string): Promise<void> {
  const path = getInitializedMarkerPath(name);
  await Bun.write(path, new Date().toISOString());
}

// Get full environment info
export async function getEnvironment(name: string): Promise<Environment | null> {
  const metadata = await loadMetadata(name);
  if (!metadata) {
    return null;
  }

  const ports = await loadPortAllocation(name);
  if (!ports) {
    return null;
  }

  const initialized = await isInitialized(name);

  return {
    name: metadata.name,
    slug: getEnvSlug(metadata.name),
    metadata,
    ports,
    initialized,
  };
}

// List all environments (returns original names, not slugs)
export async function listEnvironments(): Promise<string[]> {
  const envsExists = await directoryExists(DUST_HIVE_ENVS);
  if (!envsExists) {
    return [];
  }

  const entries = await readdir(DUST_HIVE_ENVS, { withFileTypes: true });
  const names: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      // entry.name is the slug (directory name), use it to load metadata
      const metadata = await loadMetadata(entry.name);
      if (metadata) {
        // Return the original name from metadata (may contain slashes)
        names.push(metadata.name);
      }
    }
  }

  return names.sort();
}

// Detect environment name from current working directory
// Returns the original name (with slashes) by loading metadata, or null if not in a worktree
export async function detectEnvNameFromCwd(): Promise<string | null> {
  const slug = detectEnvFromCwd();
  if (!slug) {
    return null;
  }

  const metadata = await loadMetadata(slug);
  return metadata?.name ?? null;
}

// Delete environment directory
export async function deleteEnvironmentDir(name: string): Promise<void> {
  const envDir = getEnvDir(name);
  await rm(envDir, { recursive: true, force: true });
}
