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
