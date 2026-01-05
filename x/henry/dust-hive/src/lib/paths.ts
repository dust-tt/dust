import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

// dust-hive project root (where this package lives)
export const DUST_HIVE_ROOT = resolve(dirname(import.meta.path), "../..");

// Base directories
export const DUST_HIVE_HOME = join(homedir(), ".dust-hive");
export const DUST_HIVE_ENVS = join(DUST_HIVE_HOME, "envs");
export const DUST_HIVE_ZELLIJ = join(DUST_HIVE_HOME, "zellij");
export const DUST_HIVE_WORKTREES = join(homedir(), "dust-hive");

// Global config
export const CONFIG_ENV_PATH = join(DUST_HIVE_HOME, "config.env");

// Global forwarder paths (not per-env, since forwarding is global)
export const FORWARDER_PID_PATH = join(DUST_HIVE_HOME, "forward.pid");
export const FORWARDER_LOG_PATH = join(DUST_HIVE_HOME, "forward.log");
export const FORWARDER_STATE_PATH = join(DUST_HIVE_HOME, "forward.json");

// Activity tracking (last-interacted environment)
export const ACTIVITY_PATH = join(DUST_HIVE_HOME, "activity.json");

// Per-environment paths
export function getEnvDir(name: string): string {
  return join(DUST_HIVE_ENVS, name);
}

export function getWorktreeDir(name: string): string {
  return join(DUST_HIVE_WORKTREES, name);
}

export function getEnvFilePath(name: string): string {
  return join(getEnvDir(name), "env.sh");
}

export function getDockerOverridePath(name: string): string {
  return join(getEnvDir(name), "docker-compose.override.yml");
}

export function getDockerComposePath(): string {
  return join(DUST_HIVE_ROOT, "docker-compose.yml");
}

export function getMetadataPath(name: string): string {
  return join(getEnvDir(name), "metadata.json");
}

export function getPortsPath(name: string): string {
  return join(getEnvDir(name), "ports.json");
}

export function getInitializedMarkerPath(name: string): string {
  return join(getEnvDir(name), "initialized");
}

export function getPidPath(name: string, service: string): string {
  return join(getEnvDir(name), `${service}.pid`);
}

export function getLogPath(name: string, service: string): string {
  return join(getEnvDir(name), `${service}.log`);
}

// Zellij
export function getZellijLayoutPath(): string {
  return join(DUST_HIVE_ZELLIJ, "layout.kdl");
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

// Find repo root by looking for .git directory
export async function findRepoRoot(startPath?: string): Promise<string | null> {
  let current = resolve(startPath ?? process.cwd());

  while (current !== "/") {
    const gitPath = join(current, ".git");
    try {
      await stat(gitPath);
      return current;
    } catch (error) {
      if (!isErrnoException(error) || error.code !== "ENOENT") {
        throw error;
      }
      // .git not found at this level, continue traversing up
      current = dirname(current);
    }
  }

  return null;
}

// Detect if current working directory is inside a dust-hive worktree
// Returns the environment name if found, null otherwise
export function detectEnvFromCwd(): string | null {
  const cwd = process.cwd();
  const worktreesBase = DUST_HIVE_WORKTREES;

  // Check if cwd is under ~/dust-hive/{name}/
  if (!cwd.startsWith(`${worktreesBase}/`)) {
    return null;
  }

  // Extract environment name from path
  const relativePath = cwd.slice(worktreesBase.length + 1);
  const envName = relativePath.split("/")[0];

  if (!envName) {
    return null;
  }

  return envName;
}
