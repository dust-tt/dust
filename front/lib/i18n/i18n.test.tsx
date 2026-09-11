import { activateLocale, i18n } from "@app/lib/i18n/i18n";
import { I18nProvider } from "@lingui/react";
import { useLingui } from "@lingui/react/macro";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

function AccountLabel() {
  const { t } = useLingui();
  return <span data-testid="label">{t`Account`}</span>;
}

describe("Lingui pipeline", () => {
  afterEach(async () => {
    await activateLocale("en");
  });

  it("renders the English source text by default", () => {
    render(
      <I18nProvider i18n={i18n}>
        <AccountLabel />
      </I18nProvider>
    );
    expect(screen.getByTestId("label")).toHaveTextContent("Account");
  });

  it("re-renders with the French catalog once activated", async () => {
    render(
      <I18nProvider i18n={i18n}>
        <AccountLabel />
      </I18nProvider>
    );
    await act(async () => {
      await activateLocale("fr");
    });
    expect(i18n.locale).toBe("fr");
    expect(screen.getByTestId("label")).toHaveTextContent("Compte");
  });
});
