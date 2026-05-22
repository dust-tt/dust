import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setup(role: "builder" | "user" | "admin" = "admin") {
  const { workspace, auth, globalSpace, systemSpace } =
    await createPrivateApiMockRequest({ role });
  return { workspace, globalSpace, systemSpace, auth };
}

function viewUrl(wId: string, viewId: string) {
  return `/api/w/${wId}/mcp/views/${viewId}`;
}

function patchView(wId: string, viewId: string, body: unknown) {
  return honoApp.request(viewUrl(wId, viewId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/w/:wId/mcp/views/:viewId", () => {
  it("should return 400 when no update fields are provided", async () => {
    const { workspace, auth } = await setup("admin");

    const server = await RemoteMCPServerFactory.create(workspace);
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server.sId
      );
    expect(systemView).toBeDefined();

    const response = await patchView(workspace.sId, systemView!.sId, {});

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toContain("Validation error:");
  });

  it("should return 400 when trying to update non-system view", async () => {
    const { workspace, globalSpace } = await setup("admin");

    const server = await RemoteMCPServerFactory.create(workspace);

    const serverView = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );

    const response = await patchView(workspace.sId, serverView.sId, {
      oAuthUseCase: "platform_actions",
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toBe(
      "Updates can only be performed on system views."
    );
  });

  it("should update oAuthUseCase for all views of the same MCP server when admin", async () => {
    const { workspace, auth, globalSpace } = await setup("admin");

    const server = await RemoteMCPServerFactory.create(workspace);
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server.sId
      );
    expect(systemView).toBeDefined();

    await MCPServerViewFactory.create(workspace, server.sId, globalSpace);

    const initialViews = await MCPServerViewResource.listByMCPServer(
      auth,
      server.sId
    );
    for (const view of initialViews) {
      expect(view.oAuthUseCase).toBeNull();
    }

    const response = await patchView(workspace.sId, systemView!.sId, {
      oAuthUseCase: "platform_actions",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.serverView.oAuthUseCase).toBe("platform_actions");

    const updatedViews = await MCPServerViewResource.listByMCPServer(
      auth,
      server.sId
    );
    for (const view of updatedViews) {
      expect(view.oAuthUseCase).toBe("platform_actions");
    }
  });

  it("should update name and description for all views of the same MCP server when admin", async () => {
    const { workspace, auth, globalSpace } = await setup("admin");

    const server = await RemoteMCPServerFactory.create(workspace);

    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server.sId
      );
    expect(systemView).toBeDefined();

    await MCPServerViewFactory.create(workspace, server.sId, globalSpace);

    const response = await patchView(workspace.sId, systemView!.sId, {
      name: "Updated View Name",
      description: "Updated Description",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.serverView.name).toBe("Updated View Name");
    expect(data.serverView.description).toBe("Updated Description");

    const updatedViews = await MCPServerViewResource.listByMCPServer(
      auth,
      server.sId
    );
    for (const view of updatedViews) {
      expect(view.name).toBe("Updated View Name");
      expect(view.description).toBe("Updated Description");
    }
  });

  it("should fail to update view when user has insufficient permissions", async () => {
    const { workspace, auth } = await setup("user");

    const server = await RemoteMCPServerFactory.create(workspace);
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server.sId
      );
    expect(systemView).toBeDefined();

    const response = await patchView(workspace.sId, systemView!.sId, {
      oAuthUseCase: "platform_actions",
    });

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error.type).toBe("workspace_auth_error");
  });

  it("should work with internal MCP servers and update all views", async () => {
    const { workspace, auth, globalSpace } = await setup("admin");

    await FeatureFlagFactory.basic(auth, "dev_mcp_actions");
    const server = await InternalMCPServerInMemoryResource.makeNew(auth, {
      name: "primitive_types_debugger",
      useCase: null,
    });

    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server.id
      );
    expect(systemView).toBeDefined();

    await MCPServerViewFactory.create(workspace, server.id, globalSpace);

    const initialViews = await MCPServerViewResource.listByMCPServer(
      auth,
      server.id
    );
    for (const view of initialViews) {
      expect(view.oAuthUseCase).toBeNull();
    }

    const response = await patchView(workspace.sId, systemView!.sId, {
      oAuthUseCase: "personal_actions",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.serverView.oAuthUseCase).toBe("personal_actions");

    const updatedViews = await MCPServerViewResource.listByMCPServer(
      auth,
      server.id
    );
    for (const view of updatedViews) {
      expect(view.oAuthUseCase).toBe("personal_actions");
    }
  });

  it("should return 400 when renaming to a name already used by another server", async () => {
    const { workspace, auth } = await setup("admin");

    const server1 = await RemoteMCPServerFactory.create(workspace, {
      name: "server-one",
    });
    const server2 = await RemoteMCPServerFactory.create(workspace, {
      name: "server-two",
    });

    const systemView1 =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server1.sId
      );
    const systemView2 =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server2.sId
      );
    expect(systemView1).toBeDefined();
    expect(systemView2).toBeDefined();

    const response = await patchView(workspace.sId, systemView1!.sId, {
      name: "server-two",
      description: "updated",
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toContain("server-two");
  });

  it("should allow renaming when the new name is unique", async () => {
    const { workspace, auth } = await setup("admin");

    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "original-name",
    });

    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server.sId
      );
    expect(systemView).toBeDefined();

    const response = await patchView(workspace.sId, systemView!.sId, {
      name: "unique-new-name",
      description: "updated",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.serverView.name).toBe("unique-new-name");
  });

  it("should support updating null name and description", async () => {
    const { workspace, auth } = await setup("admin");

    const server = await RemoteMCPServerFactory.create(workspace);
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server.sId
      );
    expect(systemView).toBeDefined();

    const response = await patchView(workspace.sId, systemView!.sId, {
      name: null,
      description: null,
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.serverView.name).toBeNull();
    expect(data.serverView.description).toBeNull();
  });
});
