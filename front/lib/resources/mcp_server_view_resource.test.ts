import { describe, expect, it } from "vitest";

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
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { PlanType, WhitelistableFeature } from "@app/types";

describe("MCPServerViewResource", () => {
  describe("listByWorkspace", () => {
    it("should only return views for the current workspace", async () => {
      // Create two workspaces
      const workspace1 = await WorkspaceFactory.basic();
      const workspace2 = await WorkspaceFactory.basic();

      // Create spaces for each workspace
      const systemSpace1 = await SpaceFactory.system(workspace1);
      await SpaceFactory.system(workspace2);
      const space1 = await SpaceFactory.regular(workspace1);
      const space2 = await SpaceFactory.regular(workspace2);

      // Create internals servers for each workspace

      await FeatureFlagFactory.basic("dev_mcp_actions", workspace1);
      await FeatureFlagFactory.basic("dev_mcp_actions", workspace2);

      // Mock the INTERNAL_MCP_SERVERS to override the "primitive_types_debugger" server config
      // so that the test passes even if we edit the server config.
      const originalConfig = INTERNAL_MCP_SERVERS["primitive_types_debugger"];
      Object.defineProperty(INTERNAL_MCP_SERVERS, "primitive_types_debugger", {
        value: {
          ...originalConfig,
          availability: "auto",
          isRestricted: ({
            featureFlags,
          }: {
            plan: PlanType;
            featureFlags: WhitelistableFeature[];
          }) => {
            return !featureFlags.includes("dev_mcp_actions");
          },
        },
        writable: true,
        configurable: true,
      });

      expect(
        INTERNAL_MCP_SERVERS["primitive_types_debugger"].availability
      ).toBe("auto");

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
        {
          name: "primitive_types_debugger",
          useCase: null,
        }
      );

      const internalServer2 = await InternalMCPServerInMemoryResource.makeNew(
        auth2,
        {
          name: "primitive_types_debugger",
          useCase: null,
        }
      );

      // Create MCP server views for both workspaces
      await MCPServerViewFactory.create(workspace1, internalServer1.id, space1);
      await MCPServerViewFactory.create(workspace2, internalServer2.id, space2);

      // Create a real user for workspace1
      const { globalGroup, systemGroup } =
        await GroupFactory.defaults(workspace1);
      const user1 = await UserFactory.superUser();
      await MembershipFactory.associate(workspace1, user1, { role: "user" });
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
    });
  });

  describe("listBySpaces", () => {
    it("should only return views from spaces the user has access to", async () => {
      // Create a workspace
      const workspace = await WorkspaceFactory.basic();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      // Create spaces
      await SpaceFactory.defaults(adminAuth);
      const accessibleSpace = await SpaceFactory.regular(workspace);
      const restrictedSpace = await SpaceFactory.regular(workspace);

      // Create feature flag to enable MCP actions
      await FeatureFlagFactory.basic("dev_mcp_actions", workspace);

      // Mock the INTERNAL_MCP_SERVERS config
      const originalConfig = INTERNAL_MCP_SERVERS["primitive_types_debugger"];
      Object.defineProperty(INTERNAL_MCP_SERVERS, "primitive_types_debugger", {
        value: {
          ...originalConfig,
          availability: "auto",
          isRestricted: ({
            featureFlags,
          }: {
            plan: PlanType;
            featureFlags: WhitelistableFeature[];
          }) => {
            return !featureFlags.includes("dev_mcp_actions");
          },
        },
        writable: true,
        configurable: true,
      });

      // Create internal MCP server
      const internalServer = await InternalMCPServerInMemoryResource.makeNew(
        adminAuth,
        {
          name: "primitive_types_debugger",
          useCase: null,
        }
      );

      // Create MCP server views in multiple spaces
      const viewInAccessible = await MCPServerViewFactory.create(
        workspace,
        internalServer.id,
        accessibleSpace
      );
      const viewInRestricted = await MCPServerViewFactory.create(
        workspace,
        internalServer.id,
        restrictedSpace
      );

      // Create a regular user
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "user" });

      // Set up space permissions:
      // - User is in a group that has access to accessibleSpace
      // - User is NOT in any group for restrictedSpace

      // Add user to the group that accesses accessibleSpace
      const addMemberResult = await accessibleSpace.groups[0].addMember(
        adminAuth,
        user.toJSON()
      );
      expect(addMemberResult.isOk()).toBe(true);

      // Create auth for the regular user
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      // Test: User calls listBySpaces with both spaces
      const results = await MCPServerViewResource.listBySpaces(userAuth, [
        accessibleSpace,
        restrictedSpace,
      ]);

      // Should only return the view from the accessible space
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(viewInAccessible.id);
      expect(results[0].vaultId).toBe(accessibleSpace.id);

      // Verify the restricted view was NOT returned
      const restrictedIds = results.map((v) => v.id);
      expect(restrictedIds).not.toContain(viewInRestricted.id);
    });

    it("should return empty list when user has no access to any of the provided spaces", async () => {
      // Create a workspace
      const workspace = await WorkspaceFactory.basic();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      // Create spaces
      await SpaceFactory.defaults(adminAuth);
      const space1 = await SpaceFactory.regular(workspace);
      const space2 = await SpaceFactory.regular(workspace);

      // Create feature flag to enable MCP actions
      await FeatureFlagFactory.basic("dev_mcp_actions", workspace);

      // Mock the INTERNAL_MCP_SERVERS config
      const originalConfig = INTERNAL_MCP_SERVERS["primitive_types_debugger"];
      Object.defineProperty(INTERNAL_MCP_SERVERS, "primitive_types_debugger", {
        value: {
          ...originalConfig,
          availability: "auto",
          isRestricted: ({
            featureFlags,
          }: {
            plan: PlanType;
            featureFlags: WhitelistableFeature[];
          }) => {
            return !featureFlags.includes("dev_mcp_actions");
          },
        },
        writable: true,
        configurable: true,
      });

      // Create internal MCP server
      const internalServer = await InternalMCPServerInMemoryResource.makeNew(
        adminAuth,
        {
          name: "primitive_types_debugger",
          useCase: null,
        }
      );

      // Create MCP server views in both spaces
      await MCPServerViewFactory.create(workspace, internalServer.id, space1);
      await MCPServerViewFactory.create(workspace, internalServer.id, space2);

      // Create a regular user with no group membership
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "user" });

      // Create auth for the regular user
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      // Test: User calls listBySpaces with spaces they don't have access to
      const results = await MCPServerViewResource.listBySpaces(userAuth, [
        space1,
        space2,
      ]);

      // Should return empty list since user has no access to any space
      expect(results).toHaveLength(0);
    });

    it("should return all views when user passes both accessible and restricted spaces", async () => {
      // Create a workspace
      const workspace = await WorkspaceFactory.basic();
      // Get admin auth to set up the MCP servers
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      // Create spaces
      await SpaceFactory.defaults(adminAuth);
      const space1 = await SpaceFactory.regular(workspace);
      const space2 = await SpaceFactory.regular(workspace);

      // Create feature flag to enable MCP actions
      await FeatureFlagFactory.basic("dev_mcp_actions", workspace);

      // Mock the INTERNAL_MCP_SERVERS config
      const originalConfig = INTERNAL_MCP_SERVERS["primitive_types_debugger"];
      Object.defineProperty(INTERNAL_MCP_SERVERS, "primitive_types_debugger", {
        value: {
          ...originalConfig,
          availability: "auto",
          isRestricted: ({
            featureFlags,
          }: {
            plan: PlanType;
            featureFlags: WhitelistableFeature[];
          }) => {
            return !featureFlags.includes("dev_mcp_actions");
          },
        },
        writable: true,
        configurable: true,
      });

      // Create internal MCP server
      const internalServer = await InternalMCPServerInMemoryResource.makeNew(
        adminAuth,
        {
          name: "primitive_types_debugger",
          useCase: null,
        }
      );

      // Create MCP server views in both spaces
      const view1 = await MCPServerViewFactory.create(
        workspace,
        internalServer.id,
        space1
      );
      const view2 = await MCPServerViewFactory.create(
        workspace,
        internalServer.id,
        space2
      );

      // Create a regular user
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "user" });

      // Add user to both groups
      await space1.groups[0].addMember(adminAuth, user.toJSON());
      await space2.groups[0].addMember(adminAuth, user.toJSON());

      // Create auth for the regular user
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      // Test: User calls listBySpaces with spaces they have access to
      const results = await MCPServerViewResource.listBySpaces(userAuth, [
        space1,
        space2,
      ]);

      // Should return all views since user has access to all spaces
      expect(results).toHaveLength(2);
      const resultIds = results.map((v) => v.id).sort();
      const expectedIds = [view1.id, view2.id].sort();
      expect(resultIds).toEqual(expectedIds);
    });
  });
});
