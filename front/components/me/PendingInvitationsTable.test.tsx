import { PendingInvitationsTable } from "@app/components/me/PendingInvitationsTable";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

function renderEmptyTable() {
  return render(<PendingInvitationsTable invitations={[]} />);
}

describe("PendingInvitationsTable", () => {
  it("renders in English by default", () => {
    renderEmptyTable();

    expect(screen.getByText("No pending invitations found.")).toBeDefined();
  });

  it("renders in French when fr-FR is active", async () => {
    const messages = await loadCatalog("fr-FR");
    act(() => i18n.loadAndActivate({ locale: "fr-FR", messages }));

    renderEmptyTable();

    expect(screen.getByText("Aucune invitation en attente.")).toBeDefined();
  });

  it("renders the English messages with British dates when en-GB is active", async () => {
    const messages = await loadCatalog("en-GB");
    act(() => i18n.loadAndActivate({ locale: "en-GB", messages }));
    const createdAt = Date.UTC(2026, 8, 3, 12, 0, 0);

    render(
      <I18nProvider i18n={i18n}>
        <PendingInvitationsTable
          invitations={[
            {
              token: "token",
              workspaceName: "Acme",
              initialRole: "user",
              createdAt,
              isExpired: false,
            },
          ]}
        />
      </I18nProvider>
    );

    expect(screen.getByText("Invited")).toBeDefined();
    expect(screen.getByText("Join")).toBeDefined();
    expect(
      screen.getByText(new Date(createdAt).toLocaleString("en-GB"))
    ).toBeDefined();
  });
});
