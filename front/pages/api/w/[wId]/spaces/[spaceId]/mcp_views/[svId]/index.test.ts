import type { RequestMethod } from "node-mocks-http";
import { describe, expect } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./index";

async function setupTest(
  t: any,
  role: "builder" | "user" | "admin" = "admin",
  method: RequestMethod = "DELETE"
) {
  const { req, res, workspace } = await createPrivateApiMockRequest({
    role,
    method,
  });

  const space = await SpaceFactory.system(workspace, t);

  // Set up common query parameters
  req.query.wId = workspace.sId;
  req.query.spaceId = space.sId;

  return { req, res, workspace, space };
}

describe("DELETE /api/w/[wId]/spaces/[spaceId]/mcp_views/[svId]", () => {
  itInTransaction("should delete a server view", async (t) => {
    const { req, res, workspace } = await setupTest(t, "admin", "DELETE");

    const regularSpace = await SpaceFactory.regular(workspace, t);

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const mcpServerId = InternalMCPServerInMemoryResource.nameToSId({
      name: "helloworld",
      workspaceId: workspace.id,
    });

    const serverView = await MCPServerViewFactory.create(
      workspace,
      mcpServerId,
      regularSpace
    );
    req.query.svId = serverView.sId;
    req.query.spaceId = regularSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("deleted", true);

    const deletedServerView = await MCPServerViewResource.fetchById(
      auth,
      serverView.sId
    );

    expect(deletedServerView.isErr()).toBe(true);
  });

  itInTransaction(
    "should return 404 when server view doesn't exist",
    async (t) => {
      const { req, res, workspace } = await setupTest(t, "admin", "DELETE");
      req.query.svId = makeSId("mcp_server_view", {
        id: 1000,
        workspaceId: workspace.id,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "data_source_not_found",
          message: "MCP Server View not found",
        },
      });
    }
  );
});

describe("Method Support /api/w/[wId]/spaces/[spaceId]/mcp_views/[svId]", () => {
  itInTransaction("only supports DELETE method", async (t) => {
    const { req, res, workspace, space } = await setupTest(t, "admin", "GET");
    const mcpServerId = InternalMCPServerInMemoryResource.nameToSId({
      name: "helloworld",
      workspaceId: workspace.id,
    });

    const serverView = await MCPServerViewFactory.create(
      workspace,
      mcpServerId,
      space
    );
    req.query.svId = serverView.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, only DELETE is expected.",
      },
    });
  });
});
