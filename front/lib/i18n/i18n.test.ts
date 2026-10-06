import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { LoadMore } from "@dust-tt/sparkle";
import { act, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

describe("AppI18nProvider", () => {
  // `render` wraps the tree in `AppI18nProvider` (see `vite.i18nSetup.ts`).
  it("renders sparkle components in front's active locale", async () => {
    render(createElement(LoadMore, { rowCount: 2, onLoadMore: () => {} }));
    expect(screen.getByRole("button", { name: "Load more" })).toBeDefined();

    const messages = await loadCatalog("fr-FR");
    act(() => i18n.loadAndActivate({ locale: "fr-FR", messages }));

    // Sparkle loads its own catalog once front's locale is activated.
    expect(
      await screen.findByRole("button", { name: "Charger plus" })
    ).toBeDefined();
  });
});
