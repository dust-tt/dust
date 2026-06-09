import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setup(role: "builder" | "user" | "admin" = "admin") {
  const { workspace, systemSpace } = await createPrivateApiMockRequest({
    role,
    method: "POST",
  });
  return { workspace, space: systemSpace };
}

function sync(workspace: { sId: string }, serverId: string) {
  return honoApp.request(`/api/w/${workspace.sId}/mcp/${serverId}/sync`, {
    method: "POST",
  });
}

describe("POST /api/w/:wId/mcp/:serverId/sync", () => {
  it("returns 404 when server doesn't exist", async () => {
    const { workspace } = await setup("admin");

    const response = await sync(workspace, "non-existent-server-id");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "data_source_not_found",
        message: "Remote MCP Server not found",
      },
    });
  });

  it("returns 403 when user is not an admin", async () => {
    const { workspace, space } = await setup("user");
    const server = await RemoteMCPServerFactory.create(workspace, space);

    const response = await sync(workspace, server.sId);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.type).toBe("workspace_auth_error");
    expect(body.error.message).toContain(
      "Only admin users can perform this action."
    );
  });
});
