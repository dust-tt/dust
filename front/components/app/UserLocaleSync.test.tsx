import { UserLocaleSync } from "@app/components/app/UserLocaleSync";
import { formatNumber, setFormatLocale } from "@app/lib/i18n/format";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { setLocaleOverride } from "@app/lib/i18n/locale_override";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import type { SupportedLocale } from "@app/types/locale";
import { Trans } from "@lingui/react/macro";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userLocale: "en-US" as SupportedLocale,
  isDevModeActive: true,
}));

vi.mock("@app/lib/auth/AuthContext", () => ({
  useWorkspace: () => LightWorkspaceFactory.build(),
}));

vi.mock("@app/hooks/useUserLocale", () => ({
  useUserLocale: () => ({ userLocale: state.userLocale }),
}));

vi.mock("@app/components/dev/devModeConstants", () => ({
  get DEV_MODE_ACTIVE() {
    return state.isDevModeActive;
  },
}));

function renderUserLocaleSync(onReady?: () => void) {
  return render(
    <>
      <UserLocaleSync onReady={onReady} />
      <span>
        <Trans>Untranslated probe</Trans>
      </span>
      <span>
        <Trans>Save</Trans>
      </span>
    </>
  );
}

describe("UserLocaleSync", () => {
  beforeAll(async () => {
    await loadCatalog("fr-FR");
    await loadCatalog("en-GB");
  });

  beforeEach(() => {
    document.documentElement.lang = "en";
    setFormatLocale(undefined);
    state.isDevModeActive = true;
    setLocaleOverride(null);
  });

  it("activates the user locale", async () => {
    state.userLocale = "fr-FR";

    renderUserLocaleSync();

    await waitFor(() => expect(i18n.locale).toBe("fr-FR"));
    expect(document.documentElement.lang).toBe("fr-FR");
  });

  it("activates en-GB with the en-GB catalog", async () => {
    state.userLocale = "en-GB";

    renderUserLocaleSync();

    await waitFor(() => expect(i18n.locale).toBe("en-GB"));
    expect(document.documentElement.lang).toBe("en-GB");
    expect(i18n.messages).toEqual(await loadCatalog("en-GB"));
  });

  it("formats in the user locale", async () => {
    state.userLocale = "fr-FR";

    renderUserLocaleSync();

    await waitFor(() => expect(i18n.locale).toBe("fr-FR"));
    expect(formatNumber(1234.5)).toBe("1\u202f234,5");
  });

  it("renders English for messages missing from the active catalog", async () => {
    state.userLocale = "fr-FR";

    renderUserLocaleSync();

    await waitFor(() => expect(i18n.locale).toBe("fr-FR"));
    expect(screen.getByText("Untranslated probe")).toBeDefined();
  });

  it("calls onReady once the user locale is active", async () => {
    state.userLocale = "fr-FR";
    const localesAtReady: string[] = [];

    renderUserLocaleSync(() => localesAtReady.push(i18n.locale));

    await waitFor(() => expect(localesAtReady).toEqual(["fr-FR"]));
  });

  it("activates the locale override over the user locale", async () => {
    state.userLocale = "en-US";
    setLocaleOverride("fr-FR");

    renderUserLocaleSync();

    await waitFor(() => expect(i18n.locale).toBe("fr-FR"));
    expect(formatNumber(1234.5)).toBe("1\u202f234,5");
  });

  it("switches locale as soon as the override changes", async () => {
    state.userLocale = "en-GB";
    renderUserLocaleSync();
    await waitFor(() => expect(i18n.locale).toBe("en-GB"));

    act(() => setLocaleOverride("fr-FR"));
    await waitFor(() => expect(i18n.locale).toBe("fr-FR"));

    act(() => setLocaleOverride(null));
    await waitFor(() => expect(i18n.locale).toBe("en-GB"));
  });

  it("ignores the locale override when the dev console is inactive", async () => {
    state.isDevModeActive = false;
    state.userLocale = "en-GB";
    setLocaleOverride("fr-FR");

    renderUserLocaleSync();

    await waitFor(() => expect(document.documentElement.lang).toBe("en-GB"));
    expect(i18n.locale).toBe("en-GB");
  });

  it("activates the bracketed pseudo locale with default formatting", async () => {
    state.userLocale = "fr-FR";
    setLocaleOverride("pseudo");

    renderUserLocaleSync();

    await waitFor(() => expect(i18n.locale).toBe("pseudo"));
    expect(screen.getByText("[Śàvē]")).toBeDefined();
    expect(formatNumber(1234.5)).toBe("1,234.5");
  });
});
