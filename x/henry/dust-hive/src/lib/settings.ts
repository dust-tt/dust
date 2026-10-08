import type { MultiplexerType } from "./multiplexer/types";
import { SETTINGS_PATH } from "./paths";
import type { ServiceName } from "./services";

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
  // Per-service overrides of the default warm services, managed by `dust-hive autostart`.
  autoStartServices?: Partial<Record<ServiceName, boolean>>;
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

/**
 * @cc [owner:tdraier,label:error-handling] update-settings-preserves-file
 * Shallow-merges `patch` into the settings file, keeping every other key. A key set to `undefined`
 * in `patch` is removed. Fails without writing if the existing file is not a JSON object.
 */
export async function updateSettings(patch: {
  [K in keyof Settings]?: Settings[K] | undefined;
}): Promise<void> {
  const file = Bun.file(SETTINGS_PATH);
  const current: unknown = (await file.exists()) ? await file.json() : {};
  if (typeof current !== "object" || current === null || Array.isArray(current)) {
    throw new Error(`${SETTINGS_PATH} must contain a JSON object`);
  }
  await Bun.write(SETTINGS_PATH, `${JSON.stringify({ ...current, ...patch }, null, 2)}\n`);
}

// Get the branch name for an environment
export function getBranchName(envName: string, settings: Settings): string {
  const prefix = settings.branchPrefix ?? "";
  return `${prefix}${envName}`;
}
