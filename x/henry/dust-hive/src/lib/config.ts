import { mkdir } from "node:fs/promises";
import {
  CONFIG_ENV_PATH,
  DUST_HIVE_ENVS,
  DUST_HIVE_HOME,
  DUST_HIVE_WORKTREES,
  DUST_HIVE_ZELLIJ,
} from "./paths";

// Ensure all required directories exist
export async function ensureDirectories(): Promise<void> {
  await mkdir(DUST_HIVE_HOME, { recursive: true });
  await mkdir(DUST_HIVE_ENVS, { recursive: true });
  await mkdir(DUST_HIVE_ZELLIJ, { recursive: true });
  await mkdir(DUST_HIVE_WORKTREES, { recursive: true });
}

// Check if global config.env exists
export async function configEnvExists(): Promise<boolean> {
  const file = Bun.file(CONFIG_ENV_PATH);
  return file.exists();
}

// Read global config.env as key-value pairs
export async function readConfigEnv(): Promise<Record<string, string>> {
  const file = Bun.file(CONFIG_ENV_PATH);
  if (!(await file.exists())) {
    return {};
  }

  const content = await file.text();
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^export\s+(\w+)=(.*)$/);
    if (match) {
      const key = match[1];
      const value = match[2];
      if (key !== undefined && value !== undefined) {
        // Remove surrounding quotes if present
        result[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  }

  return result;
}
