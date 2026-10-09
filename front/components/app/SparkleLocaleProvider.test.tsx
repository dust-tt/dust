import { setFormatLocale } from "@app/lib/i18n/format";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { DataTable, Pagination } from "@dust-tt/sparkle";
import { preloadSparkleLocale } from "@dust-tt/sparkle/i18n";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// `render` wraps the tree in `I18nProvider` and `SparkleLocaleProvider` (see `vite.i18nSetup.ts`).
describe("SparkleLocaleProvider", () => {
  afterEach(() => {
    setFormatLocale(undefined);
  });

  it("switches sparkle to front's active locale", async () => {
    render(
      <Pagination
        rowCount={2}
        pagination={{ pageIndex: 0, pageSize: 10 }}
        setPagination={() => {}}
      />
    );
    expect(screen.getByText("2 items")).toBeDefined();

    const [messages] = await Promise.all([
      loadCatalog("fr-FR"),
      preloadSparkleLocale("fr-FR"),
    ]);
    act(() => i18n.loadAndActivate({ locale: "fr-FR", messages }));

    expect(screen.getByText("2 éléments")).toBeDefined();
  });

  it("formats with front's format locale rather than its catalog locale", async () => {
    render(<DataTable.NumericCellContent value={1234.5} precision={1} />);

    const messages = await loadCatalog("en-US");
    // As `UserLocaleSync` does: the format locale is set before the locale is activated.
    act(() => {
      setFormatLocale("fr-FR");
      i18n.loadAndActivate({ locale: "en-GB", messages });
    });

    // `fr-FR` groups with a narrow no-break space and uses a decimal comma.
    expect(
      screen.getByText("1\u202f234,5", { normalizer: (text) => text })
    ).toBeDefined();
  });
});
