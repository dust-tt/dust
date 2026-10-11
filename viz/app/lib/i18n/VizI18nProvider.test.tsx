// @vitest-environment jsdom

import { i18n as globalI18n } from "@lingui/core";
import { useLingui } from "@lingui/react";
import { cleanup, render } from "@testing-library/react";
import { getVizCatalog } from "@viz/app/lib/i18n/catalogs";
import { VizI18nProvider } from "@viz/app/lib/i18n/VizI18nProvider";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

function RenderedLocale() {
  const { i18n } = useLingui();
  return <span>{i18n.locale}</span>;
}

describe("VizI18nProvider", () => {
  afterEach(() => {
    cleanup();
    document.documentElement.lang = "";
  });

  it("renders its locale on the server without activating the global i18n", () => {
    const html = renderToString(
      <VizI18nProvider catalog={getVizCatalog("fr-FR")}>
        <RenderedLocale />
      </VizI18nProvider>
    );

    expect(html).toContain("fr-FR");
    expect(globalI18n.locale).not.toBe("fr-FR");
  });

  it("renders its locale on the client and sets the document language", () => {
    const { getByText, rerender } = render(
      <VizI18nProvider catalog={getVizCatalog("fr-FR")}>
        <RenderedLocale />
      </VizI18nProvider>
    );
    expect(getByText("fr-FR")).toBeTruthy();
    expect(document.documentElement.lang).toBe("fr-FR");

    rerender(
      <VizI18nProvider catalog={getVizCatalog("en-US")}>
        <RenderedLocale />
      </VizI18nProvider>
    );
    expect(getByText("en-US")).toBeTruthy();
    expect(document.documentElement.lang).toBe("en-US");
  });
});
