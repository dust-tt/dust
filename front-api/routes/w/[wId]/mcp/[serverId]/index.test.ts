import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setup(role: "builder" | "user" | "admin" = "admin") {
  const { workspace, auth, systemSpace } = await createPrivateApiMockRequest({
    role,
  });
  return { workspace, space: systemSpace, auth };
}

function serverUrl(wId: string, serverId: string) {
  return `/api/w/${wId}/mcp/${serverId}`;
}

describe("GET /api/w/:wId/mcp/:serverId", () => {
  it("should return server details", async () => {
    const { workspace } = await setup();

    const server = await RemoteMCPServerFactory.create(workspace);

    const response = await honoApp.request(
      serverUrl(workspace.sId, server.sId)
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("server");
    expect(data.server).toHaveProperty("customHeaders");
    expect(data.server.customHeaders).toBeNull();
  });

  it("should return 404 when server doesn't exist", async () => {
    const { workspace } = await setup();
    const nonExistentId = makeSId("remote_mcp_server", {
      id: 1000,
      workspaceId: workspace.id,
    });

    const response = await honoApp.request(
      serverUrl(workspace.sId, nonExistentId)
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "data_source_not_found",
        message: "Remote MCP Server not found",
      },
    });
  });
});

describe("PATCH /api/w/:wId/mcp/:serverId", () => {
  it("should update headers for a remote server", async () => {
    const { workspace } = await setup("admin");

    const server = await RemoteMCPServerFactory.create(workspace);

    const response = await honoApp.request(
      serverUrl(workspace.sId, server.sId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customHeaders: [
            { key: "test-key-1", value: "value1" },
            { key: "test-key-2", value: "value2" },
          ],
        }),
      }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.server).toHaveProperty("customHeaders");
    expect(data.server.customHeaders).toBeDefined();
    expect(data.server.customHeaders).toMatchObject({
      "test-key-1": "value1",
      "test-key-2": "value2",
    });
  });

  it("should update headers for an internal server", async () => {
    const { workspace, auth } = await setup("admin");

    const server = await InternalMCPServerInMemoryResource.makeNew(auth, {
      name: "slab",
      useCase: null,
    });

    const response = await honoApp.request(
      serverUrl(workspace.sId, server.id),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customHeaders: [
            { key: "test-key-1", value: "value1" },
            { key: "test-key-2", value: "value2" },
          ],
        }),
      }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.server).toHaveProperty("customHeaders");
    expect(data.server.customHeaders).toMatchObject({
      "test-key-1": "••lue1",
      "test-key-2": "••lue2",
    });
  });

  it("should return 400 when no update fields are provided", async () => {
    const { workspace } = await setup("admin");

    const server = await RemoteMCPServerFactory.create(workspace);

    const response = await honoApp.request(
      serverUrl(workspace.sId, server.sId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toContain("Validation error:");
  });
});

describe("DELETE /api/w/:wId/mcp/:serverId", () => {
  it("should delete a server when admin", async () => {
    const { workspace, auth } = await setup("admin");

    const server = await RemoteMCPServerFactory.create(workspace);

    const response = await honoApp.request(
      serverUrl(workspace.sId, server.sId),
      {
        method: "DELETE",
      }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("deleted", true);

    const deletedServer = await RemoteMCPServerResource.fetchById(
      auth,
      server.sId
    );
    expect(deletedServer).toBeNull();
  });

  it("should fail to delete a server when user", async () => {
    const { workspace, auth } = await setup("user");

    const server = await RemoteMCPServerFactory.create(workspace);

    const response = await honoApp.request(
      serverUrl(workspace.sId, server.sId),
      {
        method: "DELETE",
      }
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toHaveProperty("error");

    const stillExists = await RemoteMCPServerResource.fetchById(
      auth,
      server.sId
    );
    expect(stillExists).toStrictEqual(server);
  });
});
