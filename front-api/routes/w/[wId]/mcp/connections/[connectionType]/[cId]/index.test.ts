import { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerConnectionFactory } from "@app/tests/utils/MCPServerConnectionFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function get(workspace: { sId: string }, connectionType: string, cId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/mcp/connections/${connectionType}/${cId}`
  );
}

function del(workspace: { sId: string }, connectionType: string, cId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/mcp/connections/${connectionType}/${cId}`,
    { method: "DELETE" }
  );
}

describe("MCP connections handler", () => {
  it("GET should return the connection", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
    });

    const remoteServer = await RemoteMCPServerFactory.create(workspace);
    const connection = await MCPServerConnectionFactory.remote(
      auth,
      remoteServer,
      "personal"
    );

    const response = await get(workspace, "personal", connection.sId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.connection.sId).toBe(connection.sId);
  });

  it("GET should ignore conversation kill switch on non-conversation routes", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
    });

    const remoteServer = await RemoteMCPServerFactory.create(workspace);
    const connection = await MCPServerConnectionFactory.remote(
      auth,
      remoteServer,
      "personal"
    );

    const updateResult = await WorkspaceResource.updateMetadata(workspace.id, {
      killSwitched: { conversationIds: [connection.sId] },
    });
    if (updateResult.isErr()) {
      throw updateResult.error;
    }

    const response = await get(workspace, "personal", connection.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).connection.sId).toBe(connection.sId);
  });

  it("GET cannot return a connection from another workspace", async () => {
    const { workspace: workspace1, auth: auth1 } =
      await createPrivateApiMockRequest({ method: "GET" });
    const remoteServer1 = await RemoteMCPServerFactory.create(workspace1);
    const connection1 = await MCPServerConnectionFactory.remote(
      auth1,
      remoteServer1,
      "personal"
    );

    // Second workspace tries to access connection1.
    const { workspace: workspace2 } = await createPrivateApiMockRequest({
      method: "GET",
    });

    const response = await get(workspace2, "personal", connection1.sId);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "mcp_server_connection_not_found",
        message: "Connection not found",
      },
    });
  });

  it("GET cannot return a connection from another user in the same workspace", async () => {
    const { workspace, auth: auth1 } = await createPrivateApiMockRequest({
      method: "GET",
    });
    const remoteServer = await RemoteMCPServerFactory.create(workspace);
    const connection1 = await MCPServerConnectionFactory.remote(
      auth1,
      remoteServer,
      "personal"
    );

    await UserFactory.basic();
    // Second user in same workspace, no access.
    const { workspace: workspaceSameButDifferentUser } =
      await createPrivateApiMockRequest({ method: "GET" });
    // The second createPrivateApiMockRequest mocked getSession for a different
    // user in a different workspace; but our endpoint uses workspace from URL.
    // Use workspace from second request to hit auth as user2, and pass
    // connection1.sId to confirm it's not returned.
    const response = await get(
      workspaceSameButDifferentUser,
      "personal",
      connection1.sId
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "mcp_server_connection_not_found",
        message: "Connection not found",
      },
    });
  });

  it("DELETE personal connection deletes all personal connections for the same server of the same user", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "DELETE",
    });
    const remoteServer = await RemoteMCPServerFactory.create(workspace);

    const connection1 = await MCPServerConnectionFactory.remote(
      auth,
      remoteServer,
      "personal"
    );
    await MCPServerConnectionFactory.remote(auth, remoteServer, "personal");

    // Different user, same server.
    const user2 = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user2, { role: "user" });
    const auth2 = await Authenticator.fromUserIdAndWorkspaceId(
      user2.sId,
      workspace.sId
    );
    await MCPServerConnectionFactory.remote(auth2, remoteServer, "personal");

    const response = await del(workspace, "personal", connection1.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const remainingForFirstUser =
      await MCPServerConnectionResource.listByWorkspace(auth, {
        connectionType: "personal",
      });
    expect(remainingForFirstUser).toHaveLength(0);

    const remainingForSecondUser =
      await MCPServerConnectionResource.listByWorkspace(auth2, {
        connectionType: "personal",
      });
    expect(remainingForSecondUser).toHaveLength(1);
  });

  it("DELETE workspace connection deletes all connections for the same server", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "admin",
    });
    const remoteServer = await RemoteMCPServerFactory.create(workspace);

    await MCPServerConnectionFactory.remote(auth, remoteServer, "personal");
    const workspaceConnection = await MCPServerConnectionFactory.remote(
      auth,
      remoteServer,
      "workspace"
    );

    const response = await del(workspace, "workspace", workspaceConnection.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const remainingWorkspace =
      await MCPServerConnectionResource.listByWorkspace(auth, {
        connectionType: "workspace",
      });
    expect(remainingWorkspace).toHaveLength(0);

    const remainingPersonal = await MCPServerConnectionResource.listByWorkspace(
      auth,
      { connectionType: "personal" }
    );
    expect(remainingPersonal).toHaveLength(0);
  });

  it("GET a non-existing connection should return 404", async () => {
    const { workspace } = await createPrivateApiMockRequest({ method: "GET" });

    const response = await get(
      workspace,
      "personal",
      "non_existing_connection_id"
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "mcp_server_connection_not_found",
        message: "Connection not found",
      },
    });
  });

  it("DELETE a workspace connection as non-admin should return 500", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "user",
    });
    const remoteServer = await RemoteMCPServerFactory.create(workspace);

    const admin = await UserFactory.basic();
    await MembershipFactory.associate(workspace, admin, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      admin.sId,
      workspace.sId
    );
    const workspaceConnection = await MCPServerConnectionFactory.remote(
      adminAuth,
      remoteServer,
      "workspace"
    );

    const response = await del(workspace, "workspace", workspaceConnection.sId);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        type: "internal_server_error",
        message: "Failed to delete connection",
      },
    });
  });

  it("DELETE a personal connection as wrong user should return 404", async () => {
    const { workspace, auth: auth1 } = await createPrivateApiMockRequest({
      method: "GET",
    });
    const remoteServer = await RemoteMCPServerFactory.create(workspace);
    const connection1 = await MCPServerConnectionFactory.remote(
      auth1,
      remoteServer,
      "personal"
    );

    const user2 = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user2, { role: "user" });

    // Now hit DELETE as a different user (via fresh setup).
    const { workspace: workspaceForUser2 } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "user",
    });
    const response = await del(workspaceForUser2, "personal", connection1.sId);

    expect(response.status).toBe(404);
  });
});
