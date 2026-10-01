import { Trans } from "@lingui/react/macro";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Sparkle components rendered without a Lingui I18nProvider, as in the extension and Storybook.
describe("Sparkle i18n fallback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each(["development", "production"])(
    "renders interpolated English without a provider (%s)",
    async (nodeEnv) => {
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
    }
  );

  it("renders <Trans> with its markup without a provider", () => {
    const name = "Ada";
    const html = renderToStaticMarkup(
      <Trans>
        Invite <strong>{name}</strong>
      </Trans>
    );

    expect(html).toBe("Invite <strong>Ada</strong>");
  });
});
