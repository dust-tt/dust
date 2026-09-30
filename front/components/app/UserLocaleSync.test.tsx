import { UserLocaleSync } from "@app/components/app/UserLocaleSync";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import type { SupportedLocale } from "@app/types/locale";
import { I18nProvider } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  hasLocalisation: false,
  userLocale: "en-US" as SupportedLocale,
}));

vi.mock("@app/lib/auth/AuthContext", () => ({
  useWorkspace: () => LightWorkspaceFactory.build(),
  useFeatureFlags: () => ({
    hasFeature: (flag: string) =>
      flag === "localisation" && state.hasLocalisation,
  }),
}));

vi.mock("@app/hooks/useUserLocale", () => ({
  useUserLocale: () => ({ userLocale: state.userLocale }),
}));

function renderWithI18n(onReady?: () => void) {
  return render(
    <I18nProvider i18n={i18n}>
      <UserLocaleSync onReady={onReady} />
      <Trans>Untranslated probe</Trans>
    </I18nProvider>
  );
}

describe("UserLocaleSync", () => {
  beforeEach(() => {
    act(() => i18n.activate("en-US"));
    document.documentElement.lang = "en";
  });

  it("keeps the default locale when the flag is disabled", async () => {
    state.hasLocalisation = false;
    state.userLocale = "fr-FR";

    renderWithI18n();

    await waitFor(() => expect(document.documentElement.lang).toBe("en-US"));
    expect(i18n.locale).toBe("en-US");
  });

  it("activates the user locale when the flag is enabled", async () => {
    state.hasLocalisation = true;
    state.userLocale = "fr-FR";

    renderWithI18n();

    await waitFor(() => expect(i18n.locale).toBe("fr-FR"));
    expect(document.documentElement.lang).toBe("fr-FR");
  });

  it("activates en-GB with the en-US messages", async () => {
    state.hasLocalisation = true;
    state.userLocale = "en-GB";

    renderWithI18n();

    await waitFor(() => expect(i18n.locale).toBe("en-GB"));
    expect(document.documentElement.lang).toBe("en-GB");
    expect(await loadCatalog("en-GB")).toBe(await loadCatalog("en-US"));
  });

  it("renders English for messages missing from the active catalog", async () => {
    state.hasLocalisation = true;
    state.userLocale = "fr-FR";

    renderWithI18n();

    await waitFor(() => expect(i18n.locale).toBe("fr-FR"));
    expect(screen.getByText("Untranslated probe")).toBeDefined();
  });

  it("calls onReady once the user locale is active", async () => {
    state.hasLocalisation = true;
    state.userLocale = "fr-FR";
    const localesAtReady: string[] = [];

    renderWithI18n(() => localesAtReady.push(i18n.locale));

    await waitFor(() => expect(localesAtReady).toEqual(["fr-FR"]));
  });
});
