import { useNoWorkspaceLocaleSync } from "@app/hooks/useNoWorkspaceLocaleSync";
import {
  formatNumber,
  getFormatLocale,
  setFormatLocale,
} from "@app/lib/i18n/format";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { setLocaleOverride } from "@app/lib/i18n/locale_override";
import type { SupportedLocale } from "@app/types/locale";
import { DEFAULT_LOCALE } from "@app/types/locale";
import { renderHook, waitFor } from "@testing-library/react";
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("@app/components/dev/devModeConstants", () => ({
  DEV_MODE_ACTIVE: true,
}));

function renderSync(
  preferredLocale?: SupportedLocale | null,
  onReady?: () => void
) {
  return renderHook(() =>
    useNoWorkspaceLocaleSync({ preferredLocale, onReady })
  );
}

describe("useNoWorkspaceLocaleSync", () => {
  beforeAll(async () => {
    await loadCatalog("fr-FR");
    await loadCatalog("en-GB");
    await loadCatalog(DEFAULT_LOCALE);
  });

  beforeEach(() => {
    setLocaleOverride(null);
    setFormatLocale(undefined);
    document.documentElement.lang = "en";
  });

  it("activates the default locale without a preferred locale", async () => {
    i18n.loadAndActivate({
      locale: "fr-FR",
      messages: await loadCatalog("fr-FR"),
    });

    renderSync(null);

    await waitFor(() => expect(i18n.locale).toBe(DEFAULT_LOCALE));
    expect(document.documentElement.lang).toBe(DEFAULT_LOCALE);
    expect(getFormatLocale()).toBeUndefined();
  });

  it("activates the preferred locale", async () => {
    renderSync("en-GB");

    await waitFor(() => expect(i18n.locale).toBe("en-GB"));
    expect(getFormatLocale()).toBe("en-GB");
  });

  it("activates the locale override over the preferred locale", async () => {
    setLocaleOverride("fr-FR");

    renderSync("en-GB");

    await waitFor(() => expect(i18n.locale).toBe("fr-FR"));
    expect(formatNumber(1234.5)).toBe("1 234,5");
  });

  it("calls onReady once the locale is active", async () => {
    const localesAtReady: string[] = [];

    renderSync("fr-FR", () => localesAtReady.push(i18n.locale));

    await waitFor(() => expect(localesAtReady).toEqual(["fr-FR"]));
  });
});
