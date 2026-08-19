import { AutomationsApiKeysTable } from "@app/components/workspace/analytics/automations/AutomationsApiKeysTable";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseAutomationsApiKeys } = vi.hoisted(() => ({
  mockUseAutomationsApiKeys: vi.fn(),
}));

vi.mock("@app/hooks/useAutomationsApiKeys", () => ({
  useAutomationsApiKeys: mockUseAutomationsApiKeys,
}));

const period = { kind: "days", days: 30 } as const;

describe("AutomationsApiKeysTable", () => {
  beforeEach(() => {
    mockUseAutomationsApiKeys.mockReturnValue({
      apiKeys: [
        {
          apiKeyName: "Support sync",
          name: "Support sync",
          credits: 120,
          previousCredits: 100,
          messageCount: 24,
          avgCreditsPerMessage: 5,
        },
      ],
      totalCredits: 1_000,
      totalCount: 1,
      isApiKeysLoading: false,
      isApiKeysError: undefined,
      isApiKeysValidating: false,
    });
  });

  it("shows API key usage on the Automations page", () => {
    render(
      <AutomationsApiKeysTable workspaceId="workspace-id" period={period} />
    );

    expect(screen.getByText("Support sync")).toBeInTheDocument();
    expect(screen.getByText("Messages")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(mockUseAutomationsApiKeys).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-id",
        period,
        limit: 25,
        offset: 0,
      })
    );
  });

  it("sends search terms to the API key ranking", async () => {
    render(
      <AutomationsApiKeysTable workspaceId="workspace-id" period={period} />
    );

    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "support" },
    });

    await waitFor(() => {
      expect(mockUseAutomationsApiKeys).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "support", offset: 0 })
      );
    });
  });
});
