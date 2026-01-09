import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { isErrnoException } from "./errors";

// dust-hive project root (where this package lives)
export const DUST_HIVE_ROOT = resolve(dirname(import.meta.path), "../..");

// Base directories
export const DUST_HIVE_HOME = join(homedir(), ".dust-hive");
export const DUST_HIVE_ENVS = join(DUST_HIVE_HOME, "envs");
export const DUST_HIVE_ZELLIJ = join(DUST_HIVE_HOME, "zellij");
export const DUST_HIVE_SCRIPTS = join(DUST_HIVE_HOME, "scripts");
export const DUST_HIVE_WORKTREES = join(homedir(), "dust-hive");

// Global config
export const CONFIG_ENV_PATH = join(DUST_HIVE_HOME, "config.env");
export const SETTINGS_PATH = join(DUST_HIVE_HOME, "settings.json");

// Global forwarder paths (not per-env, since forwarding is global)
export const FORWARDER_PID_PATH = join(DUST_HIVE_HOME, "forward.pid");
export const FORWARDER_LOG_PATH = join(DUST_HIVE_HOME, "forward.log");
export const FORWARDER_STATE_PATH = join(DUST_HIVE_HOME, "forward.json");

// Activity tracking (last-interacted environment)
export const ACTIVITY_PATH = join(DUST_HIVE_HOME, "activity.json");

// Temporal server paths (global, not per-env)
export const TEMPORAL_PID_PATH = join(DUST_HIVE_HOME, "temporal.pid");
export const TEMPORAL_LOG_PATH = join(DUST_HIVE_HOME, "temporal.log");
export const TEMPORAL_PORT = 7233;

// Main zellij session
export const MAIN_SESSION_NAME = "dust-hive-main";

// Seed user configuration
export const SEED_USER_PATH = join(DUST_HIVE_HOME, "seed-user.json");

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

// Scripts
export function getWatchScriptPath(): string {
  return join(DUST_HIVE_SCRIPTS, "watch-logs.sh");
}

// Check if a .git path represents a valid git repository
// Returns true for: real git repos (.git/HEAD exists) or worktrees (.git is a file)
async function isValidGitDir(gitPath: string): Promise<boolean> {
  try {
    const gitStat = await stat(gitPath);
    if (gitStat.isFile()) {
      // Worktree: .git is a file pointing to the main repo
      return true;
    }
    if (gitStat.isDirectory()) {
      // Real repo: must have .git/HEAD
      try {
        await stat(join(gitPath, "HEAD"));
        return true;
      } catch {
        // .git directory exists but no HEAD - not a valid repo
        // (e.g., just .git/info/exclude for local ignores)
        return false;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// Find repo root by looking for valid .git directory or file
export async function findRepoRoot(startPath?: string): Promise<string | null> {
  let current = resolve(startPath ?? process.cwd());

  while (current !== "/") {
    const gitPath = join(current, ".git");
    try {
      await stat(gitPath);
      // Found .git, but verify it's a real git repo
      if (await isValidGitDir(gitPath)) {
        return current;
      }
      // Not a valid git repo, continue traversing up
      current = dirname(current);
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
