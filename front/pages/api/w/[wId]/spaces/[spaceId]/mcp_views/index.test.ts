import { describe, expect, it } from "vitest";

import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

import handler from "./index";

describe("GET /api/w/[wId]/spaces/[spaceId]/mcp_views", () => {
  it("returns MCP servers views", async () => {
    const { req, res, systemSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });

    req.query.spaceId = systemSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      success: true,
      serverViews: expect.any(Array),
    });
  });
});

describe("POST /api/w/[wId]/spaces/[spaceId]/mcp_views", () => {
  it("should return 400 when a view with the same name already exists in the space", async () => {
    const { req, res, workspace, authenticator, globalSpace } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "POST",
      });

    await SpaceFactory.defaults(authenticator);

    // Create two remote MCP servers with the same name.
    const server1 = await RemoteMCPServerFactory.create(workspace, {
      name: "duplicate-name",
    });
    const server2 = await RemoteMCPServerFactory.create(workspace, {
      name: "duplicate-name",
    });

    // Add the first server's view to the global space.
    const systemView1 =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        authenticator,
        server1.sId
      );
    expect(systemView1).not.toBeNull();
    await MCPServerViewResource.create(authenticator, {
      systemView: systemView1!,
      space: globalSpace,
    });

    // Try to add the second server (same name) to the same space.
    req.query.spaceId = globalSpace.sId;
    req.body = { mcpServerId: server2.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain("duplicate-name");
  });

  it("should allow views with the same name in different spaces", async () => {
    const { req, res, workspace, authenticator, globalSpace, globalGroup } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "POST",
      });

    await SpaceFactory.defaults(authenticator);

    const regularSpace = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(regularSpace, globalGroup);

    // Create two remote MCP servers with the same name.
    const server1 = await RemoteMCPServerFactory.create(workspace, {
      name: "shared-name",
    });
    const server2 = await RemoteMCPServerFactory.create(workspace, {
      name: "shared-name",
    });

    // Add the first server's view to the global space.
    const systemView1 =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        authenticator,
        server1.sId
      );
    expect(systemView1).not.toBeNull();
    await MCPServerViewResource.create(authenticator, {
      systemView: systemView1!,
      space: globalSpace,
    });

    // Add the second server (same name) to a different space — should succeed.
    req.query.spaceId = regularSpace.sId;
    req.body = { mcpServerId: server2.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().success).toBe(true);
  });
});
