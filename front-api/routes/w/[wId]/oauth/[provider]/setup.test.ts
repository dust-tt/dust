import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerConnectionFactory } from "@app/tests/utils/MCPServerConnectionFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { Err } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConnectionMetadata: vi.fn(),
}));

vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/types/oauth/oauth_api")>();

  return {
    ...actual,
    OAuthAPI: vi.fn().mockImplementation(function OAuthAPIMock() {
      return {
        getConnectionMetadata: mocks.getConnectionMetadata,
      };
    }),
  };
});

function getSetup(workspace: { sId: string }, mcpServerId: string) {
  const extraConfig = encodeURIComponent(
    JSON.stringify({ mcp_server_id: mcpServerId })
  );
  return honoApp.request(
    `/api/w/${workspace.sId}/oauth/hubspot/setup?useCase=personal_actions&extraConfig=${extraConfig}`
  );
}

describe("OAuth setup handler", () => {
  beforeEach(() => {
    mocks.getConnectionMetadata.mockReset();
  });

  it("returns a 404 when the workspace connection for the MCP server is missing", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });

    // A server without any workspace-level connection.
    const remoteServer = await RemoteMCPServerFactory.create(workspace);

    const response = await getSetup(workspace, remoteServer.sId);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "mcp_server_connection_not_found",
        message:
          "This tool has no workspace-level connection. Ask a workspace admin to connect the " +
          "tool before setting up your personal connection.",
      },
    });
    expect(mocks.getConnectionMetadata).not.toHaveBeenCalled();
  });

  it("returns a 404 when the workspace connection references a connection the OAuth service no longer has", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // The front row exists but its connectionId dangles in the OAuth service
    // (e.g. after a workspace relocation).
    const remoteServer = await RemoteMCPServerFactory.create(workspace);
    await MCPServerConnectionFactory.remote(auth, remoteServer, "workspace");

    mocks.getConnectionMetadata.mockResolvedValue(
      new Err({
        code: "connection_not_found",
        message: "Requested connection was not found",
      })
    );

    const response = await getSetup(workspace, remoteServer.sId);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "mcp_server_connection_not_found",
        message:
          "This tool's workspace connection no longer exists. Ask a workspace admin to " +
          "reconnect the tool before setting up your personal connection.",
      },
    });
  });
});
