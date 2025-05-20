import { describe, expect } from "vitest";

import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/constants";
import { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { itInTransaction } from "@app/tests/utils/utils";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WhitelistableFeature } from "@app/types";

describe("MCPServerViewResource", () => {
  describe("listByWorkspace", () => {
    itInTransaction(
      "should only return views for the current workspace",
      async (t) => {
        // Create two workspaces
        const workspace1 = await WorkspaceFactory.basic();
        const workspace2 = await WorkspaceFactory.basic();

        // Create spaces for each workspace
        const systemSpace1 = await SpaceFactory.system(workspace1, t);
        await SpaceFactory.system(workspace2, t);
        const space1 = await SpaceFactory.regular(workspace1, t);
        const space2 = await SpaceFactory.regular(workspace2, t);

        // Create internals servers for each workspace

        await FeatureFlagFactory.basic(
          INTERNAL_MCP_SERVERS["think"].flag as WhitelistableFeature,
          workspace1
        );

        await FeatureFlagFactory.basic(
          INTERNAL_MCP_SERVERS["think"].flag as WhitelistableFeature,
          workspace2
        );

        expect(INTERNAL_MCP_SERVERS["think"].availability).toBe("auto");

        // Get auth for workspace1
        const auth1 = await Authenticator.internalAdminForWorkspace(
          workspace1.sId
        );

        // Get auth for workspace2
        const auth2 = await Authenticator.internalAdminForWorkspace(
          workspace2.sId
        );

        // Internal server in the right workspace
        const internalServer1 = await InternalMCPServerInMemoryResource.makeNew(
          auth1,
          "think",
          t
        );

        const internalServer2 = await InternalMCPServerInMemoryResource.makeNew(
          auth2,
          "think",
          t
        );

        // Create MCP server views for both workspaces
        await MCPServerViewFactory.create(
          workspace1,
          internalServer1.id,
          space1
        );
        await MCPServerViewFactory.create(
          workspace2,
          internalServer2.id,
          space2
        );

        // Create a real user for workspace1
        const { globalGroup, systemGroup } =
          await GroupFactory.defaults(workspace1);
        const user1 = await UserFactory.superUser();
        await MembershipFactory.associate(workspace1, user1, "user");
        await GroupSpaceFactory.associate(systemSpace1, systemGroup);
        await GroupSpaceFactory.associate(space1, globalGroup);

        const auth = await Authenticator.fromUserIdAndWorkspaceId(
          user1.sId,
          workspace1.sId
        );

        // List views for workspace1
        const views1 = await MCPServerViewResource.listByWorkspace(auth);

        // Verify we only get views for workspace1
        expect(views1).toHaveLength(2);
        expect(views1[0].workspaceId).toBe(workspace1.id);
        expect(views1[1].workspaceId).toBe(workspace1.id);

        // List views for workspace2
        const views2 = await MCPServerViewResource.listByWorkspace(auth2);

        // Verify we only get views for workspace2
        expect(views2).toHaveLength(2);
        expect(views2[0].workspaceId).toBe(workspace2.id);
        expect(views2[1].workspaceId).toBe(workspace2.id);
      }
    );
  });
});
