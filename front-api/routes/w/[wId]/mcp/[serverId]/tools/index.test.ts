import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setup(role: MembershipRoleType = "admin") {
  const { workspace, auth, systemSpace } = await createPrivateApiMockRequest({
    role,
  });
  return { workspace, space: systemSpace, auth };
}

function batchToolsUrl(wId: string, serverId: string) {
  return `/api/w/${wId}/mcp/${serverId}/tools`;
}

describe("PATCH /api/w/:wId/mcp/:serverId/tools (batch update)", () => {
  it("should batch update multiple tool settings", async () => {
    const { workspace, auth } = await setup();

    const server = await RemoteMCPServerFactory.create(workspace);

    const response = await honoApp.request(
      batchToolsUrl(workspace.sId, server.sId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tools: [
            { toolName: "tool1", permission: "low", enabled: true },
            { toolName: "tool2", permission: "never_ask", enabled: false },
            { toolName: "tool3", permission: "high", enabled: true },
          ],
        }),
      }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("success", true);
    expect(data).toHaveProperty("updatedCount", 3);

    // Verify the settings were persisted.
    const metadata = await RemoteMCPServerToolMetadataResource.fetchByServerId(
      auth,
      server.sId
    );

    expect(metadata).toHaveLength(3);

    const tool1 = metadata.find((m) => m.toolName === "tool1");
    expect(tool1).toBeDefined();
    expect(tool1?.permission).toBe("low");
    expect(tool1?.enabled).toBe(true);

    const tool2 = metadata.find((m) => m.toolName === "tool2");
    expect(tool2).toBeDefined();
    expect(tool2?.permission).toBe("never_ask");
    expect(tool2?.enabled).toBe(false);

    const tool3 = metadata.find((m) => m.toolName === "tool3");
    expect(tool3).toBeDefined();
    expect(tool3?.permission).toBe("high");
    expect(tool3?.enabled).toBe(true);
  });

  it("should update existing tool settings", async () => {
    const { workspace, auth } = await setup();

    const server = await RemoteMCPServerFactory.create(workspace);

    // Create initial settings.
    await RemoteMCPServerToolMetadataResource.updateOrCreateSettings(auth, {
      serverSId: server.sId,
      toolName: "existingTool",
      permission: "high",
      enabled: true,
    });

    // Batch update should update the existing tool.
    const response = await honoApp.request(
      batchToolsUrl(workspace.sId, server.sId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tools: [
            { toolName: "existingTool", permission: "low", enabled: false },
          ],
        }),
      }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("success", true);
    expect(data).toHaveProperty("updatedCount", 1);

    // Verify the settings were updated.
    const metadata = await RemoteMCPServerToolMetadataResource.fetchByServerId(
      auth,
      server.sId
    );

    expect(metadata).toHaveLength(1);
    expect(metadata[0].toolName).toBe("existingTool");
    expect(metadata[0].permission).toBe("low");
    expect(metadata[0].enabled).toBe(false);
  });

  it("should return 400 when tools array is empty", async () => {
    const { workspace } = await setup();

    const server = await RemoteMCPServerFactory.create(workspace);

    const response = await honoApp.request(
      batchToolsUrl(workspace.sId, server.sId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools: [] }),
      }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toContain("Validation error:");
  });

  it("should return 400 when body is missing tools field", async () => {
    const { workspace } = await setup();

    const server = await RemoteMCPServerFactory.create(workspace);

    const response = await honoApp.request(
      batchToolsUrl(workspace.sId, server.sId),
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

  it("should return 400 when tool has invalid permission", async () => {
    const { workspace } = await setup();

    const server = await RemoteMCPServerFactory.create(workspace);

    const response = await honoApp.request(
      batchToolsUrl(workspace.sId, server.sId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tools: [{ toolName: "tool1", permission: "invalid", enabled: true }],
        }),
      }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toContain("Validation error:");
  });

  it("should return 401 when user is not admin", async () => {
    const { workspace } = await setup("user");

    const server = await RemoteMCPServerFactory.create(workspace);

    const response = await honoApp.request(
      batchToolsUrl(workspace.sId, server.sId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tools: [{ toolName: "tool1", permission: "low", enabled: true }],
        }),
      }
    );

    expect(response.status).toBe(401);
  });

  it("should return 400 for invalid server ID", async () => {
    const { workspace } = await setup();

    const response = await honoApp.request(
      batchToolsUrl(workspace.sId, "invalid-server-id"),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tools: [{ toolName: "tool1", permission: "low", enabled: true }],
        }),
      }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toBe("Invalid server ID.");
  });
});
