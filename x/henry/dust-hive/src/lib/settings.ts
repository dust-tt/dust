import type { MultiplexerType } from "./multiplexer/types";
import { SETTINGS_PATH } from "./paths";

export interface Settings {
  // Prefix to add to branch names (e.g., "tom-" creates branches like "tom-myenv")
  branchPrefix?: string;
  // Enable git-spice for branch management (default: false)
  useGitSpice?: boolean;
  // Terminal multiplexer to use (default: "zellij")
  multiplexer?: MultiplexerType;
  // If true, env.sh uses the hive's front port for DUST_AUTH_REDIRECT_BASE_URL
  // instead of the stable :3000 forwarder port (default: false).
  dynamicWorkosRedirect?: boolean;
}

const DEFAULT_SETTINGS: Settings = {};

// Load settings from disk, returns defaults if file doesn't exist
export async function loadSettings(): Promise<Settings> {
  const file = Bun.file(SETTINGS_PATH);
  if (!(await file.exists())) {
    return DEFAULT_SETTINGS;
  }

  try {
    const content = await file.json();
    return { ...DEFAULT_SETTINGS, ...content };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Get the branch name for an environment
export function getBranchName(envName: string, settings: Settings): string {
  const prefix = settings.branchPrefix ?? "";
  return `${prefix}${envName}`;
}
