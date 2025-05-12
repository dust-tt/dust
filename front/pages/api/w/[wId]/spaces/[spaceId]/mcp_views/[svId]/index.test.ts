import type { RequestMethod } from "node-mocks-http";
import { describe, expect } from "vitest";

import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/constants";
import { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { itInTransaction } from "@app/tests/utils/utils";
import type { WhitelistableFeature } from "@app/types";

import handler from "./index";

async function setupTest(
  t: any,
  role: "builder" | "user" | "admin" = "admin",
  method: RequestMethod = "DELETE"
) {
  const { req, res, workspace, user } = await createPrivateApiMockRequest({
    role,
    method,
  });

  const space = await SpaceFactory.system(workspace, t);

  // Set up common query parameters
  req.query.wId = workspace.sId;
  req.query.spaceId = space.sId;

  return { req, res, workspace, space, user };
}

describe("DELETE /api/w/[wId]/spaces/[spaceId]/mcp_views/[svId]", () => {
  itInTransaction("should delete a server view", async (t) => {
    const { req, res, workspace } = await setupTest(t, "admin", "DELETE");

    const globalSpace = await SpaceFactory.global(workspace, t);

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await FeatureFlagFactory.basic(
      INTERNAL_MCP_SERVERS["primitive_types_debugger"]
        .flag as WhitelistableFeature,
      workspace
    );

    const internalServer = await InternalMCPServerInMemoryResource.makeNew(
      auth,
      "primitive_types_debugger",
      t
    );

    const serverView = await MCPServerViewFactory.create(
      workspace,
      internalServer.id,
      globalSpace
    );
    req.query.svId = serverView.sId;
    req.query.spaceId = globalSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("deleted", true);

    const deletedServerView = await MCPServerViewResource.fetchById(
      auth,
      serverView.sId
    );

    expect(deletedServerView).toBe(null);
  });

  itInTransaction(
    "should return 403 when user is not authorized to delete a server view",
    async (t) => {
      const { req, res, workspace, user } = await setupTest(
        t,
        "builder",
        "DELETE"
      );

      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const regularSpace = await SpaceFactory.regular(workspace, t);
      await regularSpace.groups[0].addMember(auth, user.toJSON(), {
        transaction: t,
      });

      await FeatureFlagFactory.basic(
        INTERNAL_MCP_SERVERS["primitive_types_debugger"]
          .flag as WhitelistableFeature,
        workspace
      );

      const internalServer = await InternalMCPServerInMemoryResource.makeNew(
        auth,
        "primitive_types_debugger",
        t
      );

      const serverView = await MCPServerViewFactory.create(
        workspace,
        internalServer.id,
        regularSpace
      );
      req.query.svId = serverView.sId;
      req.query.spaceId = regularSpace.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      const responseData = res._getJSONData();
      expect(responseData).toHaveProperty("error");
      expect(responseData.error).toHaveProperty("type", "mcp_auth_error");
      expect(responseData.error).toHaveProperty(
        "message",
        "User is not authorized to remove tools from a space."
      );
    }
  );

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

    await FeatureFlagFactory.basic(
      INTERNAL_MCP_SERVERS["primitive_types_debugger"]
        .flag as WhitelistableFeature,
      workspace
    );

    const mcpServerId = internalMCPServerNameToSId({
      name: "primitive_types_debugger",
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
