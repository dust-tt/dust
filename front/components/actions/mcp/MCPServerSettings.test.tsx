import { MCPServerSettings } from "@app/components/actions/mcp/MCPServerSettings";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { MCPServerViewTypeFactory } from "@app/tests/utils/MCPServerViewTypeFactory";
import { Ok } from "@app/types/shared/result";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConnections = vi.hoisted(() => ({
  connections: [] as Array<{
    sId: string;
    connectionType: "workspace";
    internalMCPServerId?: string;
    remoteMCPServerId?: string;
  }>,
  isConnectionsLoading: false,
}));

const mockSubmitConnect = vi.hoisted(() => vi.fn());
const mockConnectDialogProps = vi.hoisted(() => ({
  last: null as { lockUseCase?: boolean; isOpen?: boolean } | null,
}));

vi.mock("@dust-tt/sparkle", () => ({
  Button: ({
    label,
    onClick,
    disabled,
  }: {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {label}
    </button>
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
  ConnectMCPServerDialog: (props: {
    lockUseCase?: boolean;
    isOpen?: boolean;
  }) => {
    mockConnectDialogProps.last = props;
    return null;
  },
}));

vi.mock(
  "@app/components/actions/mcp/forms/submitConnectMCPServerDialogForm",
  () => ({
    submitConnectMCPServerDialogForm: (...args: unknown[]) =>
      mockSubmitConnect(...args),
  })
);

vi.mock("@app/lib/auth/AuthContext", () => ({
  useFeatureFlags: () => ({ featureFlags: [] }),
}));

vi.mock("@app/lib/auth/CellContext", () => ({
  useCellContext: () => ({ cellInfo: null }),
}));

vi.mock("@app/hooks/useNotification", () => ({
  useSendNotification: () => vi.fn(),
}));

vi.mock("@app/lib/swr/mcp_servers", () => ({
  useMCPServerConnections: () => mockConnections,
  useDeleteMCPServerConnection: () => ({
    deleteMCPServerConnection: vi.fn(),
  }),
  useCreateMCPServerConnection: () => ({
    createMCPServerConnection: vi.fn(),
  }),
  useUpdateMCPServerView: () => ({
    updateServerView: vi.fn(),
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
  beforeEach(() => {
    mockSubmitConnect.mockReset();
    mockSubmitConnect.mockResolvedValue(new Ok(null));
    mockConnectDialogProps.last = null;
  });

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

  it("Refresh relaunches OAuth without opening the connect dialog for mcp", async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(mockSubmitConnect).toHaveBeenCalledTimes(1);
    });
    expect(mockSubmitConnect.mock.calls[0][0].values.useCase).toBe(
      "platform_actions"
    );
    expect(mockConnectDialogProps.last?.isOpen).toBe(false);
  });

  it("Refresh relaunches OAuth without opening the connect dialog for mcp_static", async () => {
    const user = userEvent.setup();
    renderSettings({
      oAuthUseCase: "platform_actions",
      server: {
        url: "https://mcp.example.com",
        authorization: {
          provider: "mcp_static",
          supported_use_cases: ["platform_actions"],
        },
        lastError: "401 Unauthorized",
      },
    });

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(mockSubmitConnect).toHaveBeenCalledTimes(1);
    });
    expect(mockSubmitConnect.mock.calls[0][0].values.useCase).toBe(
      "platform_actions"
    );
    expect(mockConnectDialogProps.last?.isOpen).toBe(false);
  });

  it("Refresh opens the connect dialog with locked use case when a static form is required", async () => {
    const user = userEvent.setup();
    renderSettings({
      oAuthUseCase: "platform_actions",
      server: {
        url: "https://mcp.example.com",
        authorization: {
          provider: "snowflake",
          supported_use_cases: ["platform_actions"],
        },
        lastError: "401 Unauthorized",
      },
    });

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(mockConnectDialogProps.last?.isOpen).toBe(true);
    });
    expect(mockConnectDialogProps.last?.lockUseCase).toBe(true);
    expect(mockSubmitConnect).not.toHaveBeenCalled();
  });
});
