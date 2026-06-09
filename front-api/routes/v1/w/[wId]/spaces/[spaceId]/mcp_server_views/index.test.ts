import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getMCPServerViews(
  workspace: { sId: string },
  spaceSId: string,
  key: { secret: string }
) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/spaces/${spaceSId}/mcp_server_views`,
    {
      headers: { authorization: `Bearer ${key.secret}` },
    }
  );
}

describe("GET /api/v1/w/[wId]/spaces/[spaceId]/mcp_server_views", () => {
  it("returns 401 if no key", async () => {
    const response = await honoApp.request(
      `/api/v1/w/some_workspace/spaces/some_space/mcp_server_views`
    );

    expect(response.status).toBe(401);
  });

  it("returns MCP servers views", async () => {
    const { workspace, key } = await createPublicApiMockRequest();

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    // Create spaces
    const { globalSpace } = await SpaceFactory.defaults(auth);
    const otherSpace = await SpaceFactory.regular(workspace);

    const server = await RemoteMCPServerFactory.create(workspace);
    const server2 = await RemoteMCPServerFactory.create(workspace);
    const server3 = await RemoteMCPServerFactory.create(workspace);

    // Create system view
    await MCPServerViewResource.getMCPServerViewForSystemSpace(
      auth,
      server.sId
    );

    // Create additional views in global space for the same server
    const view1 = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );
    const view2 = await MCPServerViewFactory.create(
      workspace,
      server2.sId,
      globalSpace
    );

    // An in another space to make sure they are not returned
    await MCPServerViewFactory.create(workspace, server.sId, otherSpace);
    await MCPServerViewFactory.create(workspace, server3.sId, otherSpace);

    const response = await getMCPServerViews(workspace, globalSpace.sId, key);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      success: true,
      serverViews: expect.any(Array),
    });
    expect(data.serverViews).toEqual([view1.toJSON(), view2.toJSON()]);
  });
});
