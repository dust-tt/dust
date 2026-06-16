import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("DELETE /api/w/:wId/spaces/:spaceId/mcp_views/:svId", () => {
  it("refuses to delete an auto internal view from the global space", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "admin",
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await SpaceFactory.defaults(adminAuth);
    await MCPServerViewResource.ensureAllAutoToolsAreCreated(adminAuth);

    const view =
      await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
        adminAuth,
        "common_utilities"
      );
    expect(view).not.toBeNull();
    expect(view?.space.kind).toBe("global");

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${view?.space.sId}/mcp_views/${view?.sId}`,
      { method: "DELETE" }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("Auto tools cannot be removed");
  });

  it("deletes a remote view from a regular space", async () => {
    const { workspace, globalGroup } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "admin",
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await SpaceFactory.defaults(adminAuth);
    const space = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(space, globalGroup);

    const remoteServer = await RemoteMCPServerFactory.create(workspace);
    const view = await MCPServerViewFactory.create(
      workspace,
      remoteServer.sId,
      space
    );

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${space.sId}/mcp_views/${view.sId}`,
      { method: "DELETE" }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
  });
});
