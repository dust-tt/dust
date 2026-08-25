import type { ModelId } from "./shared/model_id";

export const CHROME_EXTENSION_LAST_USED_AT_METADATA_KEY =
  "chromeExtensionLastUsedAt";

// Resurface the install link after three months without Chrome extension activity.
export const CHROME_EXTENSION_MENU_REDISPLAY_THRESHOLD_MS =
  90 * 24 * 60 * 60 * 1000;

export function shouldShowChromeExtensionMenu(
  lastUsedAt: string | null | undefined,
  nowMs = Date.now()
): boolean {
  if (!lastUsedAt) {
    return true;
  }

  const lastUsedAtMs = Date.parse(lastUsedAt);
  if (Number.isNaN(lastUsedAtMs)) {
    return true;
  }

  return lastUsedAtMs <= nowMs - CHROME_EXTENSION_MENU_REDISPLAY_THRESHOLD_MS;
}

export type ExtensionConfigurationType = {
  id: ModelId;
  sId: string;
  blacklistedDomains: string[];
};
