import { OAuthSetupRedirectPage } from "@app/components/pages/oauth/OAuthSetupRedirectPage";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useOAuthSetup: vi.fn(),
}));

vi.mock("@app/lib/platform", () => ({
  useAppRouter: () => ({ replace: vi.fn() }),
  usePathParam: (name: string) =>
    name === "wId" ? "w_123" : name === "provider" ? "hubspot" : null,
  useSearchParam: (name: string) =>
    name === "useCase" ? "personal_actions" : null,
}));

vi.mock("@app/lib/swr/oauth", () => ({
  useOAuthSetup: mocks.useOAuthSetup,
}));

vi.mock("@dust-tt/sparkle", () => ({
  Spinner: () => <div role="status" />,
}));

function mockSetupError(error: unknown) {
  mocks.useOAuthSetup.mockReturnValue({
    redirectUrl: undefined,
    isOAuthSetupLoading: false,
    isOAuthSetupError: error,
  });
}

const GENERIC_MESSAGE = "Failed to initialize OAuth connection.";

describe("OAuthSetupRedirectPage error display", () => {
  beforeEach(() => {
    mocks.useOAuthSetup.mockReset();
  });

  it("displays the actionable message for mcp_server_connection_not_found", () => {
    const message =
      "This tool's workspace connection no longer exists. Ask a workspace admin to " +
      "reconnect the tool before setting up your personal connection.";
    mockSetupError({
      error: { type: "mcp_server_connection_not_found", message },
    });

    render(<OAuthSetupRedirectPage />);

    expect(screen.getByText(message)).toBeTruthy();
  });

  it("displays the generic message for internal_server_error", () => {
    mockSetupError({
      error: {
        type: "internal_server_error",
        message: "Failed to get connection metadata: ECONNREFUSED 10.0.0.1",
      },
    });

    render(<OAuthSetupRedirectPage />);

    expect(screen.getByText(GENERIC_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(/ECONNREFUSED/)).toBeNull();
  });

  it("displays the generic message for non-API errors", () => {
    mockSetupError(new Error("fetch failed"));

    render(<OAuthSetupRedirectPage />);

    expect(screen.getByText(GENERIC_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(/fetch failed/)).toBeNull();
  });
});
