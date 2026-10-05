import * as workosAudit from "@app/lib/api/audit/workos_audit";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/audit/workos_audit", async () => {
  const actual = await vi.importActual<typeof workosAudit>(
    "@app/lib/api/audit/workos_audit"
  );
  return {
    ...actual,
    emitAuditLogEvent: vi.fn(),
  };
});

beforeEach(() => {
  vi.mocked(workosAudit.emitAuditLogEvent).mockClear();
});

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
    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "mcp_server.tool_settings_updated",
        metadata: {
          server_id: server.sId,
          tool_count: "2",
        },
      })
    );

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
    expect(workosAudit.emitAuditLogEvent).not.toHaveBeenCalled();
  });

  it("rejects malformed server IDs", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const response = await honoApp.request(
      updateToolsUrl(workspace.sId, "not-a-server-id"),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tools: [
            {
              toolName: "search",
              permission: "high",
              enabled: true,
            },
          ],
        }),
      }
    );

    expect(response.status).toBe(400);
    expect(workosAudit.emitAuditLogEvent).not.toHaveBeenCalled();
  });

  it("rejects users who cannot administer the system space", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });
    const server = await RemoteMCPServerFactory.create(workspace);

    const response = await honoApp.request(
      updateToolsUrl(workspace.sId, server.sId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tools: [
            {
              toolName: "search",
              permission: "high",
              enabled: true,
            },
          ],
        }),
      }
    );

    expect(response.status).toBe(403);
    expect(workosAudit.emitAuditLogEvent).not.toHaveBeenCalled();
  });
});
