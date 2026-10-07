import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { Pagination } from "@sparkle/components/Pagination";
import { loadSparkleI18n } from "@sparkle/lib/i18n/catalogs";
import { SparkleI18nProvider } from "@sparkle/lib/i18n/SparkleI18nProvider";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const pagination = (
  <Pagination
    rowCount={2}
    pagination={{ pageIndex: 0, pageSize: 10 }}
    setPagination={() => undefined}
  />
);

describe("SparkleI18nProvider", () => {
  it("renders English without a provider", () => {
    const html = renderToStaticMarkup(pagination);

    expect(html).toContain("2 items");
  });

  it("renders a preloaded locale from the first render", async () => {
    await loadSparkleI18n("fr-FR");

    // `renderToStaticMarkup` renders once, without running effects.
    const html = renderToStaticMarkup(
      <SparkleI18nProvider locale="fr-FR">{pagination}</SparkleI18nProvider>
    );

    expect(html).toContain("2 éléments");
  });

  it("ignores the consumer's I18nProvider", () => {
    const i18n = setupI18n();
    i18n.loadAndActivate({ locale: "fr-FR", messages: {} });

    const html = renderToStaticMarkup(
      <I18nProvider i18n={i18n}>{pagination}</I18nProvider>
    );

    expect(html).toContain("2 items");
  });
});
