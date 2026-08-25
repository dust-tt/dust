import {
  CHROME_EXTENSION_MENU_REDISPLAY_THRESHOLD_MS,
  shouldShowChromeExtensionMenu,
} from "@app/types/extension";
import { describe, expect, it } from "vitest";

const NOW_MS = Date.UTC(2026, 7, 25);

describe("shouldShowChromeExtensionMenu", () => {
  it.each([
    { lastUsedAt: undefined, expected: true },
    { lastUsedAt: "invalid", expected: true },
    { lastUsedAt: new Date(NOW_MS).toISOString(), expected: false },
    {
      lastUsedAt: new Date(
        NOW_MS - CHROME_EXTENSION_MENU_REDISPLAY_THRESHOLD_MS
      ).toISOString(),
      expected: true,
    },
  ])("returns $expected for $lastUsedAt", ({ lastUsedAt, expected }) => {
    expect(shouldShowChromeExtensionMenu(lastUsedAt, NOW_MS)).toBe(expected);
  });
});
