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
});
