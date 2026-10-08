import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { NumericCellContent } from "@sparkle/components/DataTable/cells";
import { Pagination } from "@sparkle/components/Pagination";
import { preloadSparkleLocale } from "@sparkle/lib/i18n/catalogs";
import { formatDate, useFormatLocale } from "@sparkle/lib/i18n/format";
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

  it("picks plural forms with the catalog's language, not the format locale's", () => {
    // `fr-FR` treats 0 as singular, English as plural.
    const html = renderToStaticMarkup(
      <SparkleI18nProvider locale="en-US" formatLocale="fr-FR">
        <Pagination
          rowCount={0}
          pagination={{ pageIndex: 0, pageSize: 10 }}
          setPagination={() => undefined}
        />
      </SparkleI18nProvider>
    );

    expect(html).toContain("0 items");
  });

  it("formats dates in the format locale", () => {
    const date = new Date(Date.UTC(2026, 0, 31, 12));
    function FormattedDate() {
      return <>{formatDate(date, { timeZone: "UTC" }, useFormatLocale())}</>;
    }
    const render = (formatLocale: string) =>
      renderToStaticMarkup(
        <SparkleI18nProvider locale="en-US" formatLocale={formatLocale}>
          <FormattedDate />
        </SparkleI18nProvider>
      );

    expect([render("en-US"), render("en-GB")]).toEqual([
      "1/31/2026",
      "31/01/2026",
    ]);
  });
});
