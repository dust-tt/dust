import { verifyWorkspaceOAuthConnectionForMCPServer } from "@app/lib/api/oauth/mcp_server_connection_auth";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerConnectionFactory } from "@app/tests/utils/MCPServerConnectionFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { Err, Ok } from "@app/types/shared/result";
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

async function setupWithWorkspaceConnection() {
  const { workspace, authenticator } = await createResourceTest({
    role: "admin",
  });
  const remoteServer = await RemoteMCPServerFactory.create(workspace);
  await MCPServerConnectionFactory.remote(
    authenticator,
    remoteServer,
    "workspace"
  );
  return { authenticator, remoteServer };
}

describe("verifyWorkspaceOAuthConnectionForMCPServer", () => {
  beforeEach(() => {
    mocks.getConnectionMetadata.mockReset();
  });

  it("returns Ok when the connection exists in the OAuth service", async () => {
    const { authenticator, remoteServer } =
      await setupWithWorkspaceConnection();

    mocks.getConnectionMetadata.mockResolvedValue(
      new Ok({ connection: { connection_id: "con_workspace" } })
    );

    const result = await verifyWorkspaceOAuthConnectionForMCPServer(
      authenticator,
      remoteServer.sId
    );

    expect(result.isOk()).toBe(true);
  });

  it("returns Err when the OAuth service no longer has the connection", async () => {
    const { authenticator, remoteServer } =
      await setupWithWorkspaceConnection();

    mocks.getConnectionMetadata.mockResolvedValue(
      new Err({
        code: "connection_not_found",
        message: "Requested connection was not found",
      })
    );

    const result = await verifyWorkspaceOAuthConnectionForMCPServer(
      authenticator,
      remoteServer.sId
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe("connection_not_found");
      expect(result.error.message).toBe(
        "This tool's workspace connection no longer exists. Ask a workspace admin to " +
          "reconnect the tool before setting up your personal connection."
      );
    }
  });

  it("passes on transient OAuth service failures so callers surface them as internal errors", async () => {
    const { authenticator, remoteServer } =
      await setupWithWorkspaceConnection();

    for (const code of [
      "unexpected_network_error",
      "internal_server_error",
      "unexpected_response_format",
    ]) {
      mocks.getConnectionMetadata.mockResolvedValue(
        new Err({ code, message: "OAuth service unavailable" })
      );

      const result = await verifyWorkspaceOAuthConnectionForMCPServer(
        authenticator,
        remoteServer.sId
      );

      expect(result.isOk()).toBe(true);
    }
  });

  it("returns Err without calling the OAuth service when there is no workspace connection row", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "admin",
    });
    const remoteServer = await RemoteMCPServerFactory.create(workspace);

    const result = await verifyWorkspaceOAuthConnectionForMCPServer(
      authenticator,
      remoteServer.sId
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe("connection_not_found");
      expect(result.error.message).toBe(
        "This tool has no workspace-level connection. Ask a workspace admin to connect the " +
          "tool before setting up your personal connection."
      );
    }
    expect(mocks.getConnectionMetadata).not.toHaveBeenCalled();
  });
});
