import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DustMcpServerSettingsSheet } from "./DustMcpServerSettingsSheet";

vi.mock("@app/lib/auth/AuthContext", () => ({
  useAuth: () => ({ isAdmin: true }),
}));

function renderSheet() {
  render(
    <DustMcpServerSettingsSheet
      isOpen
      onOpenChange={vi.fn()}
      settings={{
        disabled: false,
        acceptAllRedirectUris: false,
        allowedRedirectUris: ["http://localhost:*"],
      }}
      isSaving={false}
      onSave={vi.fn()}
    />
  );
}

function typeRedirectUri(value: string) {
  fireEvent.change(
    screen.getByPlaceholderText("https://example.com/oauth/callback"),
    {
      target: { value },
    }
  );
}

describe("DustMcpServerSettingsSheet", () => {
  it("shows the validation error of a redirect URI without a scheme", () => {
    renderSheet();
    typeRedirectUri("not-a-uri");

    expect(
      screen.getByText(
        "Redirect URI must include a scheme (for example http://, https://, or cursor://)."
      )
    ).toBeDefined();
  });

  it("translates the validation error in fr-FR", async () => {
    const messages = await loadCatalog("fr-FR");
    act(() => i18n.loadAndActivate({ locale: "fr-FR", messages }));
    renderSheet();
    typeRedirectUri("not-a-uri");

    expect(
      screen.getByText(
        "L’URI de redirection doit inclure un schéma (par exemple http://, https:// ou cursor://)."
      )
    ).toBeDefined();
  });

  it("translates the duplicate redirect URI error in fr-FR", async () => {
    const messages = await loadCatalog("fr-FR");
    act(() => i18n.loadAndActivate({ locale: "fr-FR", messages }));
    renderSheet();
    typeRedirectUri("http://localhost:*");

    expect(
      screen.getByText("Cette URI de redirection figure déjà dans la liste.")
    ).toBeDefined();
  });
});
