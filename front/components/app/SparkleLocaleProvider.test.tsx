import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { LoadMore } from "@dust-tt/sparkle";
import { preloadSparkleLocale } from "@dust-tt/sparkle/i18n";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// `render` wraps the tree in `I18nProvider` and `SparkleLocaleProvider` (see `vite.i18nSetup.ts`).
describe("SparkleLocaleProvider", () => {
  it("switches sparkle to front's active locale", async () => {
    render(<LoadMore rowCount={2} onLoadMore={() => {}} />);
    expect(screen.getByRole("button", { name: "Load more" })).toBeDefined();

    const [messages] = await Promise.all([
      loadCatalog("fr-FR"),
      preloadSparkleLocale("fr-FR"),
    ]);
    act(() => i18n.loadAndActivate({ locale: "fr-FR", messages }));

    expect(screen.getByRole("button", { name: "Charger plus" })).toBeDefined();
  });
});
