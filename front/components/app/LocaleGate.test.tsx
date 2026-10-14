import { LocaleGate } from "@app/components/app/LocaleGate";
import { formatNumber, setFormatLocale } from "@app/lib/i18n/format";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { setLocaleOverride } from "@app/lib/i18n/locale_override";
import type { SupportedLocale } from "@app/types/locale";
import { Trans } from "@lingui/react/macro";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isDevModeActive: true,
  failSparklePreload: false,
}));

vi.mock("@dust-tt/sparkle/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dust-tt/sparkle/i18n")>();
  return {
    ...actual,
    preloadSparkleLocale: (
      locale: Parameters<typeof actual.preloadSparkleLocale>[0]
    ) =>
      state.failSparklePreload
        ? Promise.reject(new Error("Failed to preload"))
        : actual.preloadSparkleLocale(locale),
  };
});

vi.mock("@app/components/dev/devModeConstants", () => ({
  get DEV_MODE_ACTIVE() {
    return state.isDevModeActive;
  },
}));

function localeSync(locale: SupportedLocale) {
  return (
    <LocaleGate locale={locale} fallback={<span>Loading probe</span>}>
      <span>
        <Trans>Save</Trans>
      </span>
    </LocaleGate>
  );
}

describe("LocaleGate", () => {
  beforeAll(async () => {
    await loadCatalog("fr-FR");
    await loadCatalog("en-GB");
  });

  beforeEach(() => {
    document.documentElement.lang = "en";
    setFormatLocale(undefined);
    state.isDevModeActive = true;
    state.failSparklePreload = false;
    setLocaleOverride(null);
  });

  it("renders the fallback until the locale is active, then the children", async () => {
    render(localeSync("fr-FR"));

    expect(screen.getByText("Loading probe")).toBeDefined();
    expect(screen.queryByText("Enregistrer")).toBeNull();

    expect(await screen.findByText("Enregistrer")).toBeDefined();
    expect(screen.queryByText("Loading probe")).toBeNull();
    expect(i18n.locale).toBe("fr-FR");
    expect(document.documentElement.lang).toBe("fr-FR");
    expect(formatNumber(1234.5)).toBe("1 234,5");
  });

  it("activates the locale override over the locale prop", async () => {
    setLocaleOverride("fr-FR");

    render(localeSync("en-US"));

    expect(await screen.findByText("Enregistrer")).toBeDefined();
  });

  it("ignores the locale override when the dev console is inactive", async () => {
    state.isDevModeActive = false;
    setLocaleOverride("fr-FR");

    render(localeSync("en-GB"));

    expect(await screen.findByText("Save")).toBeDefined();
    expect(i18n.locale).toBe("en-GB");
  });

  it("activates the pseudo locale with default formatting", async () => {
    setLocaleOverride("pseudo");

    render(localeSync("fr-FR"));

    expect(await screen.findByText("[Śàvē]")).toBeDefined();
    expect(formatNumber(1234.5)).toBe("1,234.5");
  });

  it("shows the fallback again while the locale prop changes", async () => {
    const { rerender } = render(localeSync("en-GB"));
    expect(await screen.findByText("Save")).toBeDefined();

    act(() => rerender(localeSync("fr-FR")));

    expect(screen.getByText("Loading probe")).toBeDefined();
    expect(await screen.findByText("Enregistrer")).toBeDefined();
    await waitFor(() => expect(i18n.locale).toBe("fr-FR"));
  });

  it("renders the children in the previous locale when the load fails", async () => {
    const { rerender } = render(localeSync("en-GB"));
    expect(await screen.findByText("Save")).toBeDefined();

    state.failSparklePreload = true;
    act(() => rerender(localeSync("fr-FR")));

    expect(screen.getByText("Loading probe")).toBeDefined();
    expect(await screen.findByText("Save")).toBeDefined();
    expect(i18n.locale).toBe("en-GB");
  });
});
