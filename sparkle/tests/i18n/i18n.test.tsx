import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { LoadMore } from "@sparkle/components/LoadMore";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// An app's Lingui instance: it carries the locale but none of Sparkle's messages.
function renderInApp(locale: string, ui: React.ReactElement) {
  const appI18n = setupI18n({ locale, messages: { [locale]: {} } });
  return renderToStaticMarkup(<I18nProvider i18n={appI18n}>{ui}</I18nProvider>);
}

describe("Sparkle i18n", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // Sparkle components rendered without a Lingui I18nProvider, as in marketing, viz, the extension
  // and Storybook.
  it.each([
    "development",
    "production",
  ])("renders interpolated English without a provider (%s)", async (nodeEnv) => {
    // Only production builds of @lingui/core leave the message compiler unset.
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.resetModules();
    const { LoadMore } = await import("@sparkle/components/LoadMore");

    const html = renderToStaticMarkup(
      <>
        <LoadMore rowCount={1} onLoadMore={() => {}} />
        <LoadMore rowCount={3} totalRowCount={42} onLoadMore={() => {}} />
      </>
    );

    expect(html).toContain("Load more");
    expect(html).toContain("1 item<");
    expect(html).toContain("Showing 3 of 42 items");
  });

  it("renders <Trans> with its markup without a provider", () => {
    const name = "Ada";
    const html = renderToStaticMarkup(
      <Trans>
        Invite <strong>{name}</strong>
      </Trans>
    );

    expect(html).toBe("Invite <strong>Ada</strong>");
  });

  it("translates with its own catalog in the app's locale", () => {
    const html = renderInApp(
      "fr-FR",
      <LoadMore rowCount={3} totalRowCount={42} onLoadMore={() => {}} />
    );

    expect(html).toContain("Charger plus");
    expect(html).toContain("3 sur 42 éléments");
  });

  it("renders the en-US catalog for a locale of the same language", () => {
    const html = renderInApp(
      "en-GB",
      <LoadMore rowCount={1} totalRowCount={1} onLoadMore={() => {}} />
    );

    expect(html).toContain("Showing 1 of 1 item<");
  });

  it("falls back to English for a locale without a catalog", () => {
    const html = renderInApp(
      "de-DE",
      <LoadMore rowCount={1} onLoadMore={() => {}} />
    );

    expect(html).toContain("Load more");
    expect(html).toContain("1 item<");
  });
});
