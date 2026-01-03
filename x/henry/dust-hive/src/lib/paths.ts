import { homedir } from "node:os";
import { join } from "node:path";

// Base directories
export const DUST_HIVE_HOME = join(homedir(), ".dust-hive");
export const DUST_HIVE_ENVS = join(DUST_HIVE_HOME, "envs");
export const DUST_HIVE_ZELLIJ = join(DUST_HIVE_HOME, "zellij");
export const DUST_HIVE_WORKTREES = join(homedir(), "dust-hive");

// Global config
export const CONFIG_ENV_PATH = join(DUST_HIVE_HOME, "config.env");

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

// Find repo root by looking for .git directory
export async function findRepoRoot(startPath?: string): Promise<string | null> {
  let current = startPath || process.cwd();

  while (current !== "/") {
    const gitPath = join(current, ".git");
    const file = Bun.file(gitPath);
    if (await file.exists()) {
      return current;
    }
    current = join(current, "..");
  }

  return null;
}
