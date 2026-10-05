import type { MCPServerConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerConnectionFactory } from "@app/tests/utils/MCPServerConnectionFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function connectionsUrl(wId: string, connectionType: string) {
  return `/api/w/${wId}/mcp/connections/${connectionType}`;
}

describe("GET /api/w/:wId/mcp/connections/:connectionType", () => {
  it("should return personal connections filtered by user ID", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest();

    const remoteServer = await RemoteMCPServerFactory.create(workspace);

    await MCPServerConnectionFactory.remote(auth, remoteServer, "personal");
    const connection2 = await MCPServerConnectionFactory.remote(
      auth,
      remoteServer,
      "personal"
    );

    const response = await honoApp.request(
      connectionsUrl(workspace.sId, "personal")
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.connections).toHaveLength(1);
    expect(data.connections[0].sId).toBe(connection2.sId);
  });

  it("should return workspace connections", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const remoteServer = await RemoteMCPServerFactory.create(workspace);
    const now = new Date();

    await MCPServerConnectionFactory.remote(
      auth,
      remoteServer,
      "workspace",
      new Date(now.getTime() - 60000)
    );
    const connection2 = await MCPServerConnectionFactory.remote(
      auth,
      remoteServer,
      "workspace",
      now
    );

    const response = await honoApp.request(
      connectionsUrl(workspace.sId, "workspace")
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.connections).toHaveLength(1);
    expect(data.connections[0].sId).toBe(connection2.sId);
  });

  it("should handle different server IDs correctly", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest();

    const remoteServer1 = await RemoteMCPServerFactory.create(workspace);
    const remoteServer2 = await RemoteMCPServerFactory.create(workspace);

    const connection1 = await MCPServerConnectionFactory.remote(
      auth,
      remoteServer1,
      "personal"
    );
    const connection2 = await MCPServerConnectionFactory.remote(
      auth,
      remoteServer2,
      "personal"
    );

    const response = await honoApp.request(
      connectionsUrl(workspace.sId, "personal")
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.connections).toHaveLength(2);
    expect(
      data.connections.map((c: MCPServerConnectionType) => c.sId).sort()
    ).toEqual([connection1.sId, connection2.sId].sort());
  });

  it("should handle internal server connections", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest();

    const now = new Date();

    await MCPServerConnectionFactory.internal(
      auth,
      "internal_server_1",
      "personal",
      new Date(now.getTime() - 60000)
    );
    const connection2 = await MCPServerConnectionFactory.internal(
      auth,
      "internal_server_1",
      "personal",
      now
    );

    const response = await honoApp.request(
      connectionsUrl(workspace.sId, "personal")
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.connections).toHaveLength(1);
    expect(data.connections[0].sId).toBe(connection2.sId);
  });

  it("should return 400 for invalid connection type", async () => {
    const { workspace } = await createPrivateApiMockRequest();

    const response = await honoApp.request(
      connectionsUrl(workspace.sId, "invalid")
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Invalid connection type",
      },
    });
  });

  it("should not leak personal connections across workspaces", async () => {
    const { workspace: workspace1, auth: authenticator1 } =
      await createPrivateApiMockRequest();

    const remoteServer1 = await RemoteMCPServerFactory.create(workspace1);
    const connection1 = await MCPServerConnectionFactory.remote(
      authenticator1,
      remoteServer1,
      "personal"
    );

    const { workspace: workspace2, auth: authenticator2 } =
      await createPrivateApiMockRequest();

    const remoteServer2 = await RemoteMCPServerFactory.create(workspace2);
    const connection2 = await MCPServerConnectionFactory.remote(
      authenticator2,
      remoteServer2,
      "personal"
    );

    const response = await honoApp.request(
      connectionsUrl(workspace2.sId, "personal")
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.connections).toHaveLength(1);
    expect(data.connections[0].sId).toBe(connection2.sId);
    expect(data.connections[0].sId).not.toBe(connection1.sId);
  });

  it("should not leak workspace connections across workspaces", async () => {
    const { workspace: workspace1, auth: authenticator1 } =
      await createPrivateApiMockRequest({ role: "admin" });
    const remoteServer1 = await RemoteMCPServerFactory.create(workspace1);
    const connection1 = await MCPServerConnectionFactory.remote(
      authenticator1,
      remoteServer1,
      "workspace"
    );

    const { workspace: workspace2, auth: authenticator2 } =
      await createPrivateApiMockRequest({ role: "admin" });
    const remoteServer2 = await RemoteMCPServerFactory.create(workspace2);
    const connection2 = await MCPServerConnectionFactory.remote(
      authenticator2,
      remoteServer2,
      "workspace"
    );

    const response = await honoApp.request(
      connectionsUrl(workspace2.sId, "workspace")
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.connections).toHaveLength(1);
    expect(data.connections[0].sId).toBe(connection2.sId);
    expect(data.connections[0].sId).not.toBe(connection1.sId);
  });
});
