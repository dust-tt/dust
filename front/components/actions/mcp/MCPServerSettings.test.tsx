import { MCPServerSettings } from "@app/components/actions/mcp/MCPServerSettings";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { MCPServerViewTypeFactory } from "@app/tests/utils/MCPServerViewTypeFactory";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockConnections = vi.hoisted(() => ({
  connections: [] as Array<{
    sId: string;
    connectionType: "workspace";
    internalMCPServerId?: string;
    remoteMCPServerId?: string;
  }>,
  isConnectionsLoading: false,
}));

vi.mock("@dust-tt/sparkle", () => ({
  Button: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
  Chip: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Hoverable: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  LogIn01: () => null,
  RefreshCw02: () => null,
  Tooltip: ({
    label,
    trigger,
  }: {
    label: string;
    trigger: React.ReactNode;
  }) => (
    <div>
      {trigger}
      <span data-testid="tooltip-label">{label}</span>
    </div>
  ),
  XClose: () => null,
}));

vi.mock("@app/components/actions/mcp/create/ConnectMCPServerDialog", () => ({
  ConnectMCPServerDialog: () => null,
}));

vi.mock("@app/lib/auth/AuthContext", () => ({
  useFeatureFlags: () => ({ featureFlags: [] }),
}));

vi.mock("@app/lib/swr/mcp_servers", () => ({
  useMCPServerConnections: () => mockConnections,
  useDeleteMCPServerConnection: () => ({
    deleteMCPServerConnection: vi.fn(),
  }),
}));

vi.mock("@app/lib/actions/mcp_helper", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/actions/mcp_helper")>();
  return {
    ...actual,
    isRemoteMCPServerType: () => true,
  };
});

const owner = LightWorkspaceFactory.build();

function renderSettings(
  overrides: Parameters<typeof MCPServerViewTypeFactory.build>[0] = {}
) {
  const mcpServerView = MCPServerViewTypeFactory.build(overrides);
  mockConnections.connections = [
    {
      sId: "conn_1",
      connectionType: "workspace",
      remoteMCPServerId: mcpServerView.server.sId,
    },
  ];
  mockConnections.isConnectionsLoading = false;
  return render(
    <MCPServerSettings owner={owner} mcpServerView={mcpServerView} />
  );
}

describe("MCPServerSettings sync auth status", () => {
  it("shows Warning, More info, shared tooltip, Refresh, and Deactivate when connected with lastError and platform_actions", () => {
    renderSettings({
      oAuthUseCase: "platform_actions",
      server: {
        url: "https://mcp.example.com",
        authorization: {
          provider: "mcp",
          supported_use_cases: ["platform_actions"],
        },
        lastError: "401 Unauthorized",
      },
    });

    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("More info")).toBeInTheDocument();
    expect(screen.getByTestId("tooltip-label")).toHaveTextContent(
      "Shared authentication is no longer valid and must be refreshed"
    );
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Deactivate" })
    ).toBeInTheDocument();
  });

  it("shows personal tooltip text when personal_actions and lastError", () => {
    renderSettings({
      oAuthUseCase: "personal_actions",
      server: {
        url: "https://mcp.example.com",
        authorization: {
          provider: "mcp",
          supported_use_cases: ["personal_actions"],
        },
        lastError: "token expired",
      },
    });

    expect(screen.getByTestId("tooltip-label")).toHaveTextContent(
      "Agents still use each member's personal authentication and are unaffected"
    );
  });

  it("shows Active (not Warning) when lastError is null, still has Refresh", () => {
    renderSettings({
      oAuthUseCase: "platform_actions",
      server: {
        url: "https://mcp.example.com",
        authorization: {
          provider: "mcp",
          supported_use_cases: ["platform_actions"],
        },
        lastError: null,
      },
    });

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("Warning")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });
});
