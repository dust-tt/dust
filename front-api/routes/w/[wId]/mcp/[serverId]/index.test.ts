import * as workosAudit from "@app/lib/api/audit/workos_audit";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { REDACTED_HEADER_VALUES_ERROR_MESSAGE } from "@app/types/shared/utils/http_headers";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/audit/workos_audit", async () => ({
  ...(await vi.importActual("@app/lib/api/audit/workos_audit")),
  emitAuditLogEvent: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(workosAudit.emitAuditLogEvent).mockClear();
});

async function setup(role: MembershipRoleType = "admin") {
  const { workspace, auth, systemSpace, globalSpace } =
    await createPrivateApiMockRequest({
      role,
    });
  return { workspace, space: systemSpace, globalSpace, auth };
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
      "test-key-1": "••••••••",
      "test-key-2": "••••••••",
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
      "test-key-1": "••••••••",
      "test-key-2": "••••••••",
    });
  });

  it("should reject headers carrying a redacted value and keep the stored ones", async () => {
    const { workspace, auth } = await setup("admin");
    const server = await RemoteMCPServerFactory.create(workspace);
    await server.updateMetadata(auth, {
      customHeaders: { "X-Api-Key": "secret-one" },
      lastSyncAt: new Date(),
    });

    const response = await honoApp.request(
      serverUrl(workspace.sId, server.sId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customHeaders: [
            { key: "X-Api-Key", value: "••••••••" },
            { key: "X-New", value: "fresh" },
          ],
        }),
      }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toContain(REDACTED_HEADER_VALUES_ERROR_MESSAGE);
    const stored = await RemoteMCPServerResource.findByPk(auth, server.id, {
      includeHeavyAttributes: ["customHeaders"],
    });
    expect(stored?.getCustomHeaders()).toEqual({ "X-Api-Key": "secret-one" });
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
    expect(workosAudit.emitAuditLogEvent).not.toHaveBeenCalled();

    const stillExists = await RemoteMCPServerResource.fetchById(
      auth,
      server.sId,
      // The factory returns the server with its heavy attributes — fetch it back the same way so the
      // structural comparison holds.
      {
        includeHeavyAttributes: [
          "authorization",
          "cachedTools",
          "customHeaders",
          "lastError",
          "sharedSecret",
        ],
      }
    );
    expect(stillExists).toStrictEqual(server);
  });

  it("emits mcp_server.deleted with the non-system space count", async () => {
    const { workspace, globalSpace } = await setup("admin");
    const server = await RemoteMCPServerFactory.create(workspace);
    await MCPServerViewFactory.create(workspace, server.sId, globalSpace);

    const response = await honoApp.request(
      serverUrl(workspace.sId, server.sId),
      { method: "DELETE" }
    );

    expect(response.status).toBe(200);
    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "mcp_server.deleted",
        targets: expect.arrayContaining([
          expect.objectContaining({ type: "mcp_server", id: server.sId }),
        ]),
        metadata: expect.objectContaining({ space_count: "1" }),
      })
    );
  });
});

describe("PATCH /api/w/:wId/mcp/:serverId catalog audit", () => {
  it("emits mcp_server.updated with derived change_kind for icon, cleared credentials, and cleared meta", async () => {
    const { workspace } = await setup("admin");
    const server = await RemoteMCPServerFactory.create(workspace);

    const icon = await honoApp.request(serverUrl(workspace.sId, server.sId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ icon: "ActionRobotIcon" }),
    });
    expect(icon.status).toBe(200);
    expect(workosAudit.emitAuditLogEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "mcp_server.updated",
        metadata: expect.objectContaining({
          change_kind: "display",
        }),
      })
    );

    const credentials = await honoApp.request(
      serverUrl(workspace.sId, server.sId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedSecret: "", customHeaders: [] }),
      }
    );
    expect(credentials.status).toBe(200);
    expect(workosAudit.emitAuditLogEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "mcp_server.updated",
        metadata: expect.objectContaining({
          change_kind: "credentials",
          shared_secret_change: "cleared",
          custom_headers_change: "cleared",
        }),
      })
    );

    const meta = await honoApp.request(serverUrl(workspace.sId, server.sId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta: null }),
    });
    expect(meta.status).toBe(200);
    expect(workosAudit.emitAuditLogEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "mcp_server.updated",
        metadata: expect.objectContaining({
          change_kind: "meta",
          meta_cleared: "true",
        }),
      })
    );
  });

  it("emits mcp_server.updated for internal credentials without the secret value", async () => {
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
        body: JSON.stringify({ sharedSecret: "slab-token" }),
      }
    );

    expect(response.status).toBe(200);
    expect(
      JSON.stringify(vi.mocked(workosAudit.emitAuditLogEvent).mock.calls)
    ).not.toContain("slab-token");
    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "mcp_server.updated",
        metadata: expect.objectContaining({
          server_type: "internal",
          change_kind: "credentials",
          shared_secret_change: "set",
        }),
      })
    );
  });

  it("emits nothing for an internal meta-only patch", async () => {
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
        body: JSON.stringify({ meta: { note: "ignored" } }),
      }
    );

    expect(response.status).toBe(200);
    expect(workosAudit.emitAuditLogEvent).not.toHaveBeenCalled();
  });
});
