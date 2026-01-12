import { SETTINGS_PATH } from "./paths";

export interface Settings {
  // Prefix to add to branch names (e.g., "tom-" creates branches like "tom-myenv")
  branchPrefix?: string;
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

// Save settings to disk
export async function saveSettings(settings: Settings): Promise<void> {
  await Bun.write(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`);
}

// Get the branch name for an environment
export function getBranchName(envName: string, settings: Settings): string {
  const prefix = settings.branchPrefix ?? "";
  return `${prefix}${envName}`;
}
