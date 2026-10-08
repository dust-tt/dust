import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { NumericCellContent } from "@sparkle/components/DataTable/cells";
import { Pagination } from "@sparkle/components/Pagination";
import {
  loadSparkleI18n,
  preloadSparkleLocale,
} from "@sparkle/lib/i18n/catalogs";
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
    await preloadSparkleLocale("fr-FR");

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

  it("formats numbers in the format locale with the catalog of the locale", async () => {
    await preloadSparkleLocale("fr-FR");

    const html = renderToStaticMarkup(
      <SparkleI18nProvider locale="en-US" formatLocale="fr-FR">
        {pagination}
        <NumericCellContent value={1234.5} precision={1} />
      </SparkleI18nProvider>
    );

    expect(html).toContain("2 items");
    // `fr-FR` groups with a narrow no-break space and uses a decimal comma.
    expect(html).toContain("1\u202f234,5");
  });

  it("formats dates in the format locale", () => {
    const date = new Date(Date.UTC(2026, 0, 31, 12));
    const formatDate = (formatLocale: string) =>
      loadSparkleI18n("en-US", formatLocale).then((i18n) =>
        i18n.date(date, { timeZone: "UTC" })
      );

    return expect(
      Promise.all([formatDate("en-US"), formatDate("en-GB")])
    ).resolves.toEqual(["1/31/2026", "31/01/2026"]);
  });
});
