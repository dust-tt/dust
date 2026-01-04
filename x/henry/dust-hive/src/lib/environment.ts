import { mkdir, readdir, rm } from "node:fs/promises";
import { DUST_HIVE_ENVS, getEnvDir, getInitializedMarkerPath, getMetadataPath } from "./paths";
import type { PortAllocation } from "./ports";
import { loadPortAllocation } from "./ports";
import { createPropertyChecker } from "./typeGuards";

export interface EnvironmentMetadata {
  name: string;
  baseBranch: string;
  workspaceBranch: string;
  createdAt: string;
  repoRoot: string;
}

// Type guard for EnvironmentMetadata
export function isEnvironmentMetadata(data: unknown): data is EnvironmentMetadata {
  const checker = createPropertyChecker(data);
  if (!checker) return false;

  return (
    checker.hasString("name") &&
    checker.hasString("baseBranch") &&
    checker.hasString("workspaceBranch") &&
    checker.hasString("createdAt") &&
    checker.hasString("repoRoot")
  );
}

export interface Environment {
  name: string;
  metadata: EnvironmentMetadata;
  ports: PortAllocation;
  initialized: boolean;
}

// Validate environment name
export function validateEnvName(name: string): { valid: boolean; error?: string } {
  if (!name) {
    return { valid: false, error: "Name is required" };
  }

  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    return {
      valid: false,
      error:
        "Name must start with a letter and contain only lowercase letters, numbers, and hyphens",
    };
  }

  if (name.length > 32) {
    return { valid: false, error: "Name must be 32 characters or less" };
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
    name,
    metadata,
    ports,
    initialized,
  };
}

// List all environments
export async function listEnvironments(): Promise<string[]> {
  try {
    const entries = await readdir(DUST_HIVE_ENVS, { withFileTypes: true });
    const names: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const exists = await environmentExists(entry.name);
        if (exists) {
          names.push(entry.name);
        }
      }
    }

    return names.sort();
  } catch {
    // envs directory may not exist yet on first run
    return [];
  }
}

// Delete environment directory
export async function deleteEnvironmentDir(name: string): Promise<void> {
  const envDir = getEnvDir(name);
  await rm(envDir, { recursive: true, force: true });
}
