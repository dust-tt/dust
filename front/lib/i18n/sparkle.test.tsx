import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { LoadMore } from "@dust-tt/sparkle";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// Sparkle's strings live in front's catalogs and render through front's I18nProvider. This fails
// when `@lingui/react` is duplicated: Sparkle would then read another context and stay English.
describe("Sparkle translations", () => {
  it("renders Sparkle strings in the active locale", async () => {
    const messages = await loadCatalog("fr-FR");
    act(() => i18n.loadAndActivate({ locale: "fr-FR", messages }));

    render(<LoadMore rowCount={1} totalRowCount={42} onLoadMore={() => {}} />);

    expect(screen.getByText("Charger plus")).toBeDefined();
    expect(screen.getByText("1 sur 42 éléments")).toBeDefined();
  });

  it("renders Sparkle strings in English by default", () => {
    render(<LoadMore rowCount={1} onLoadMore={() => {}} />);

    expect(screen.getByText("Load more")).toBeDefined();
    expect(screen.getByText("1 item")).toBeDefined();
  });
});
