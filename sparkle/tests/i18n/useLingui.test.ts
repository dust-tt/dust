import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { LoadMore } from "@sparkle/components/LoadMore";
import { loadSparkleCatalog } from "@sparkle/lib/i18n/catalogs";
import { SparkleI18nProvider } from "@sparkle/lib/i18n/SparkleI18nProvider";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const loadMore = () =>
  createElement(LoadMore, { rowCount: 2, onLoadMore: () => undefined });

describe("useLingui", () => {
  it("renders English without a SparkleI18nProvider", () => {
    const html = renderToStaticMarkup(loadMore());

    expect(html).toContain("Load more");
    expect(html).toContain("2 items");
  });

  it("renders a preloaded locale from the first render", async () => {
    await loadSparkleCatalog("fr-FR");

    // `renderToStaticMarkup` renders once, without running effects.
    const html = renderToStaticMarkup(
      createElement(SparkleI18nProvider, { locale: "fr-FR" }, loadMore())
    );

    expect(html).toContain("Charger plus");
    expect(html).toContain("2 éléments");
  });

  it("ignores the consumer's I18nProvider", () => {
    const i18n = setupI18n();
    i18n.loadAndActivate({ locale: "fr-FR", messages: {} });

    const html = renderToStaticMarkup(
      createElement(I18nProvider, { i18n }, loadMore())
    );

    expect(html).toContain("Load more");
  });
});
