import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function updateToolsUrl(workspaceId: string, serverId: string) {
  return `/api/w/${workspaceId}/mcp/${serverId}/tools`;
}

describe("PATCH /api/w/:wId/mcp/:serverId/tools", () => {
  it("creates and updates remote tool settings in one request", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const server = await RemoteMCPServerFactory.create(workspace);
    await RemoteMCPServerToolMetadataResource.updateOrCreateSettings(auth, {
      serverId: server.sId,
      toolName: "existing_tool",
      permission: "low",
      enabled: true,
    });

    const response = await honoApp.request(
      updateToolsUrl(workspace.sId, server.sId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tools: [
            {
              toolName: "existing_tool",
              permission: "high",
              enabled: false,
            },
            {
              toolName: "new_tool",
              permission: "never_ask",
              enabled: true,
            },
          ],
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const metadata = await RemoteMCPServerToolMetadataResource.fetchByServerId(
      auth,
      server.sId
    );
    expect(
      metadata
        .map(({ toolName, permission, enabled }) => ({
          toolName,
          permission,
          enabled,
        }))
        .sort((a, b) => a.toolName.localeCompare(b.toolName))
    ).toEqual([
      {
        toolName: "existing_tool",
        permission: "high",
        enabled: false,
      },
      {
        toolName: "new_tool",
        permission: "never_ask",
        enabled: true,
      },
    ]);
  });

  it("creates and updates internal tool settings in one request", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const server = await InternalMCPServerInMemoryResource.makeNew(auth, {
      name: "slab",
      useCase: null,
    });

    const response = await honoApp.request(
      updateToolsUrl(workspace.sId, server.id),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tools: [
            {
              toolName: "search",
              permission: "high",
              enabled: false,
            },
            {
              toolName: "fetch",
              permission: "low",
              enabled: true,
            },
          ],
        }),
      }
    );

    expect(response.status).toBe(200);
    const metadata = await RemoteMCPServerToolMetadataResource.fetchByServerId(
      auth,
      server.id
    );
    expect(metadata).toHaveLength(2);
  });

  it("rejects duplicate tool names", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    const server = await RemoteMCPServerFactory.create(workspace);
    const tool = {
      toolName: "duplicate_tool",
      permission: "low",
      enabled: true,
    };

    const response = await honoApp.request(
      updateToolsUrl(workspace.sId, server.sId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools: [tool, tool] }),
      }
    );

    expect(response.status).toBe(400);
  });
});
