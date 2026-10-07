import * as workosAudit from "@app/lib/api/audit/workos_audit";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/audit/workos_audit", async () => ({
  ...(await vi.importActual("@app/lib/api/audit/workos_audit")),
  emitAuditLogEvent: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(workosAudit.emitAuditLogEvent).mockClear();
});

function toolUrl(workspaceId: string, serverId: string, toolName: string) {
  return `/api/w/${workspaceId}/mcp/${serverId}/tools/${toolName}`;
}

describe("PATCH /api/w/:wId/mcp/:serverId/tools/:toolName", () => {
  it("emits mcp_server.tool_settings_updated with tool_count 1", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const server = await RemoteMCPServerFactory.create(workspace);

    const response = await honoApp.request(
      toolUrl(workspace.sId, server.sId, "search"),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permission: "low", enabled: false }),
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledTimes(1);
    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "mcp_server.tool_settings_updated",
        targets: [
          expect.objectContaining({ type: "workspace", id: workspace.sId }),
        ],
        metadata: {
          server_id: server.sId,
          tool_count: "1",
        },
      })
    );

    const metadata = await RemoteMCPServerToolMetadataResource.fetchByServerId(
      auth,
      server.sId
    );
    expect(
      metadata.map(({ toolName, permission, enabled }) => ({
        toolName,
        permission,
        enabled,
      }))
    ).toEqual([
      {
        toolName: "search",
        permission: "low",
        enabled: false,
      },
    ]);
  });
});
