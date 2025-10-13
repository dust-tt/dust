import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import {
  createPublicApiAuthenticationTests,
  createPublicApiMockRequest,
} from "@app/tests/utils/generic_public_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

import handler from "./index";

describe(
  "public api authentication tests",
  createPublicApiAuthenticationTests(handler)
);

describe("GET /api/w/[wId]/spaces/[spaceId]/mcp_views", () => {
  it("returns MCP servers views", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest();

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    // Create spaces
    const { globalSpace } = await SpaceFactory.defaults(auth);
    const otherSpace = await SpaceFactory.regular(workspace);
    req.query.spaceId = globalSpace.sId;

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

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      success: true,
      serverViews: expect.any(Array),
    });
    expect(res._getJSONData().serverViews).toEqual([
      view1.toJSON(),
      view2.toJSON(),
    ]);
  });
});
