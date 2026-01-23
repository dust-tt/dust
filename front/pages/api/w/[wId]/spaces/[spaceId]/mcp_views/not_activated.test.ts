import { describe, expect, it } from "vitest";

import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

import handler from "./not_activated";

describe("GET /api/w/[wId]/spaces/[spaceId]/mcp_views/not_activated", () => {
  it("returns activable MCP servers views", async () => {
    const { req, res, workspace, globalGroup, globalSpace, systemSpace } =
      await createPrivateApiMockRequest({
        role: "admin",
      });

    req.query.spaceId = systemSpace.sId;

    // Create a regular space to test the endpoint on
    const space = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(space, globalGroup);

    // Create two test servers
    const mcpServer1 = await RemoteMCPServerFactory.create(workspace, {
      name: "Test Server 1",
      url: "https://test-server-1.example.com",
      tools: [
        {
          name: "tool-1",
          description: "Tool 1 description",
          inputSchema: undefined,
        },
      ],
    });

    const mcpServer2 = await RemoteMCPServerFactory.create(workspace, {
      name: "Test Server 2",
      url: "https://test-server-2.example.com",
      tools: [
        {
          name: "tool-2",
          description: "Tool 2 description",
          inputSchema: undefined,
        },
      ],
    });

    await MCPServerViewFactory.create(workspace, mcpServer1.sId, globalSpace);

    // Add query params
    req.query = {
      ...req.query,
      spaceId: space.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      success: true,
      serverViews: expect.any(Array),
    });

    // Only the server view that is not in the global space should be return as activable.
    expect(res._getJSONData().serverViews).toHaveLength(1);
    expect(res._getJSONData().serverViews[0].server.sId).toBe(
      mcpServer2.toJSON().sId
    );
  });
});
