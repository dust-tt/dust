import { JoinPage } from "@app/components/pages/onboarding/JoinPage";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import type { APIErrorResponse } from "@app/types/error";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasLocalisation: false,
}));

const autoJoinDisabledError: APIErrorResponse = {
  error: {
    type: "workspace_auto_join_disabled",
    message:
      "The workspace does not have a verified domain with auto-join enabled.",
  },
};

vi.mock("@app/lib/platform", () => ({
  useRequiredPathParam: () => "workspace-id",
  useSearchParam: () => null,
}));

vi.mock("@app/lib/swr/workspaces", () => ({
  useJoinData: () => ({
    joinData: null,
    isJoinDataLoading: false,
    redirectUrl: null,
    joinDataError: autoJoinDisabledError,
    mutateJoinData: vi.fn(),
  }),
  useNoWorkspaceUserLocale: () => ({
    hasLocalisation: mocks.hasLocalisation,
  }),
}));

describe("JoinPage", () => {
  beforeEach(() => {
    mocks.hasLocalisation = false;
  });

  it("shows the server message without localisation", () => {
    render(<JoinPage />);

    expect(
      screen.getByText(
        "The workspace does not have a verified domain with auto-join enabled."
      )
    ).toBeDefined();
  });

  it("describes the error from its type, the server message in details", async () => {
    mocks.hasLocalisation = true;
    const messages = await loadCatalog("fr-FR");
    act(() => i18n.loadAndActivate({ locale: "fr-FR", messages }));

    render(<JoinPage />);

    expect(
      screen.getByText(
        "Impossible de rejoindre ce workspace avec votre e-mail professionnel. Demandez à un administrateur de vous inviter."
      )
    ).toBeDefined();
    expect(
      screen.getByText(
        /The workspace does not have a verified domain with auto-join enabled\./
      )
    ).toBeDefined();
  });
});
