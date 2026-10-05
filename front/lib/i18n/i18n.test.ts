import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { LoadMore } from "@dust-tt/sparkle";
import { sparkleSourceLocaleMessages } from "@dust-tt/sparkle/i18n";
import { act, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

describe("loadCatalog", () => {
  it("includes the sparkle messages", async () => {
    const messages = await loadCatalog("fr-FR");

    for (const id of Object.keys(sparkleSourceLocaleMessages)) {
      expect(messages).toHaveProperty(id);
    }
  });

  // Also covers `single-lingui-react-copy`: with two copies of `@lingui/react`, sparkle would not
  // see front's provider and would keep rendering English.
  it("renders sparkle components in front's active locale", async () => {
    render(createElement(LoadMore, { rowCount: 2, onLoadMore: () => {} }));
    expect(screen.getByRole("button", { name: "Load more" })).toBeDefined();

    const messages = await loadCatalog("fr-FR");
    act(() => i18n.loadAndActivate({ locale: "fr-FR", messages }));

    expect(screen.getByRole("button", { name: "Charger plus" })).toBeDefined();
  });
});
