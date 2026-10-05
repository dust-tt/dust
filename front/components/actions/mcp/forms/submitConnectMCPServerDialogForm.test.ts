import { submitConnectMCPServerDialogForm } from "@app/components/actions/mcp/forms/submitConnectMCPServerDialogForm";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { MCPServerViewTypeFactory } from "@app/tests/utils/MCPServerViewTypeFactory";
import { setupOAuthConnection } from "@app/types/oauth/client/setup";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/types/oauth/client/setup", () => ({
  setupOAuthConnection: vi.fn(),
}));

describe("submitConnectMCPServerDialogForm", () => {
  const owner = LightWorkspaceFactory.build();
  const createMCPServerConnection = vi.fn();
  const updateServerView = vi.fn();

  beforeEach(() => {
    vi.mocked(setupOAuthConnection).mockReset();
    createMCPServerConnection.mockReset();
    updateServerView.mockReset();
    createMCPServerConnection.mockResolvedValue({});
    updateServerView.mockResolvedValue(true);
  });

  it("passes mcp_server_id so Refresh can reuse stored OAuth metadata", async () => {
    const mcpServerView = MCPServerViewTypeFactory.build({
      oAuthUseCase: "platform_actions",
      server: {
        url: "https://mcp.example.com",
        authorization: {
          provider: "mcp",
          supported_use_cases: ["platform_actions"],
        },
      },
    });

    vi.mocked(setupOAuthConnection).mockResolvedValue(
      new Ok({
        connection_id: "con_new",
        created: Date.now(),
        provider: "mcp",
        status: "finalized",
        metadata: {},
      })
    );

    const result = await submitConnectMCPServerDialogForm({
      owner,
      mcpServerView,
      authorization: {
        provider: "mcp",
        supported_use_cases: ["platform_actions"],
      },
      values: {
        useCase: "platform_actions",
        authCredentials: null,
      },
      createMCPServerConnection,
      updateServerView,
      onBeforeAssociateConnection: () => {},
      cellInfo: null,
    });

    expect(result.isOk()).toBe(true);
    expect(setupOAuthConnection).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        provider: "mcp",
        useCase: "platform_actions",
        extraConfig: {
          mcp_server_id: mcpServerView.server.sId,
        },
      })
    );
  });

  it("surfaces OAuth setup failures", async () => {
    const mcpServerView = MCPServerViewTypeFactory.build({
      server: {
        url: "https://mcp.example.com",
        authorization: {
          provider: "mcp",
          supported_use_cases: ["platform_actions"],
        },
      },
    });

    vi.mocked(setupOAuthConnection).mockResolvedValue(
      new Err(new Error("Failed to initialize OAuth connection"))
    );

    const result = await submitConnectMCPServerDialogForm({
      owner,
      mcpServerView,
      authorization: {
        provider: "mcp",
        supported_use_cases: ["platform_actions"],
      },
      values: {
        useCase: "platform_actions",
        authCredentials: null,
      },
      createMCPServerConnection,
      updateServerView,
      onBeforeAssociateConnection: () => {},
      cellInfo: null,
    });

    expect(result.isErr()).toBe(true);
    expect(createMCPServerConnection).not.toHaveBeenCalled();
  });
});
