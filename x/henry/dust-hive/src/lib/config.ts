import { mkdir } from "node:fs/promises";
import { CONFIG_ENV_PATH, DUST_HIVE_ENVS, DUST_HIVE_HOME, DUST_HIVE_WORKTREES } from "./paths";

// Ensure all required directories exist
// Note: Multiplexer layout directories are created by the multiplexer adapter when needed
export async function ensureDirectories(): Promise<void> {
  await mkdir(DUST_HIVE_HOME, { recursive: true });
  await mkdir(DUST_HIVE_ENVS, { recursive: true });
  await mkdir(DUST_HIVE_WORKTREES, { recursive: true });
}

// Check if global config.env exists
export async function configEnvExists(): Promise<boolean> {
  const file = Bun.file(CONFIG_ENV_PATH);
  return file.exists();
}
