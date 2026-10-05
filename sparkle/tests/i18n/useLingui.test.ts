import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { LoadMore } from "@sparkle/components/LoadMore";
import { loadSparkleCatalog } from "@sparkle/lib/i18n/catalogs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const loadMore = () =>
  createElement(LoadMore, { rowCount: 2, onLoadMore: () => undefined });

describe("useLingui", () => {
  it("renders English without an I18nProvider", () => {
    const html = renderToStaticMarkup(loadMore());

    expect(html).toContain("Load more");
    expect(html).toContain("2 items");
  });

  it("renders in the locale of the nearest I18nProvider", async () => {
    const i18n = setupI18n();
    i18n.loadAndActivate({
      locale: "fr-FR",
      messages: await loadSparkleCatalog("fr-FR"),
    });

    const html = renderToStaticMarkup(
      createElement(I18nProvider, { i18n }, loadMore())
    );

    expect(html).toContain("Charger plus");
    expect(html).toContain("2 éléments");
  });
});
