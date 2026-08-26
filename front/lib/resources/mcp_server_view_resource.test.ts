import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/constants";
import { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { PlanType } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

      await FeatureFlagFactory.basic(
        await Authenticator.internalAdminForWorkspace(workspace1.sId),
        "http_client_tool"
      );
      await FeatureFlagFactory.basic(
        await Authenticator.internalAdminForWorkspace(workspace2.sId),
        "http_client_tool"
      );

      // Mock the INTERNAL_MCP_SERVERS to override the "http_client" server config
      // so that the test passes even if we edit the server config.
      const originalConfig = INTERNAL_MCP_SERVERS["http_client"];
      Object.defineProperty(INTERNAL_MCP_SERVERS, "http_client", {
        value: {
          ...originalConfig,
          availability: "auto",
          isRestricted: ({
            featureFlags,
          }: {
            plan: PlanType;
            featureFlags: WhitelistableFeature[];
          }) => {
            return !featureFlags.includes("http_client_tool");
          },
        },
        writable: true,
        configurable: true,
      });

      expect(INTERNAL_MCP_SERVERS["http_client"].availability).toBe("auto");

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
          name: "http_client",
          useCase: null,
        }
      );

      const internalServer2 = await InternalMCPServerInMemoryResource.makeNew(
        auth2,
        {
          name: "http_client",
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
      await FeatureFlagFactory.basic(adminAuth, "http_client_tool");

      // Mock the INTERNAL_MCP_SERVERS config
      const originalConfig = INTERNAL_MCP_SERVERS["http_client"];
      Object.defineProperty(INTERNAL_MCP_SERVERS, "http_client", {
        value: {
          ...originalConfig,
          availability: "auto",
          isRestricted: ({
            featureFlags,
          }: {
            plan: PlanType;
            featureFlags: WhitelistableFeature[];
          }) => {
            return !featureFlags.includes("http_client_tool");
          },
        },
        writable: true,
        configurable: true,
      });

      // Create internal MCP server
      const internalServer = await InternalMCPServerInMemoryResource.makeNew(
        adminAuth,
        {
          name: "http_client",
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
      const [accessibleGroup] =
        await accessibleSpace.fetchRegularAutoGroups(adminAuth);
      if (!accessibleGroup) {
        throw new Error("Expected a regular group on the accessible space");
      }
      const addMemberResult = await accessibleGroup.dangerouslyAddMember(
        adminAuth,
        {
          user: user.toJSON(),
        }
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
      await FeatureFlagFactory.basic(adminAuth, "http_client_tool");

      // Mock the INTERNAL_MCP_SERVERS config
      const originalConfig = INTERNAL_MCP_SERVERS["http_client"];
      Object.defineProperty(INTERNAL_MCP_SERVERS, "http_client", {
        value: {
          ...originalConfig,
          availability: "auto",
          isRestricted: ({
            featureFlags,
          }: {
            plan: PlanType;
            featureFlags: WhitelistableFeature[];
          }) => {
            return !featureFlags.includes("http_client_tool");
          },
        },
        writable: true,
        configurable: true,
      });

      // Create internal MCP server
      const internalServer = await InternalMCPServerInMemoryResource.makeNew(
        adminAuth,
        {
          name: "http_client",
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
      await FeatureFlagFactory.basic(adminAuth, "http_client_tool");

      // Mock the INTERNAL_MCP_SERVERS config
      const originalConfig = INTERNAL_MCP_SERVERS["http_client"];
      Object.defineProperty(INTERNAL_MCP_SERVERS, "http_client", {
        value: {
          ...originalConfig,
          availability: "auto",
          isRestricted: ({
            featureFlags,
          }: {
            plan: PlanType;
            featureFlags: WhitelistableFeature[];
          }) => {
            return !featureFlags.includes("http_client_tool");
          },
        },
        writable: true,
        configurable: true,
      });

      // Create internal MCP server
      const internalServer = await InternalMCPServerInMemoryResource.makeNew(
        adminAuth,
        {
          name: "http_client",
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
      const [group1] = await space1.fetchRegularAutoGroups(adminAuth);
      const [group2] = await space2.fetchRegularAutoGroups(adminAuth);
      if (!group1 || !group2) {
        throw new Error("Expected regular groups on both spaces");
      }
      await group1.dangerouslyAddMember(adminAuth, {
        user: user.toJSON(),
      });
      await group2.dangerouslyAddMember(adminAuth, {
        user: user.toJSON(),
      });

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

  describe("listBySpaceIds", () => {
    it("can filter skills-only views in the database query", async () => {
      const workspace = await WorkspaceFactory.basic();
      const adminUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, adminUser, {
        role: "admin",
      });
      const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
        adminUser.sId,
        workspace.sId
      );
      const { globalSpace } = await SpaceFactory.defaults(adminAuth);

      const availableServer = await RemoteMCPServerFactory.create(workspace, {
        name: "Available Server",
      });
      const restrictedServer = await RemoteMCPServerFactory.create(workspace, {
        name: "Skills-only Server",
      });
      const availableView = await MCPServerViewFactory.create(
        workspace,
        availableServer.sId,
        globalSpace
      );
      const restrictedView = await MCPServerViewFactory.create(
        workspace,
        restrictedServer.sId,
        globalSpace
      );
      const restrictionResult = await restrictedView.updateIsRestrictedToSkills(
        adminAuth,
        true
      );
      expect(restrictionResult.isOk()).toBe(true);

      const allViews = await MCPServerViewResource.listBySpaceIds(adminAuth, [
        globalSpace.sId,
      ]);
      expect(allViews.map((view) => view.sId).sort()).toEqual(
        [availableView.sId, restrictedView.sId].sort()
      );

      const directlyAvailableViews = await MCPServerViewResource.listBySpaceIds(
        adminAuth,
        [globalSpace.sId],
        { isRestrictedToSkills: false }
      );
      expect(directlyAvailableViews.map((view) => view.sId)).toEqual([
        availableView.sId,
      ]);
    });

    it("includes global space views without fetching spaces", async () => {
      const workspace = await WorkspaceFactory.basic();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const { globalSpace } = await SpaceFactory.defaults(adminAuth);
      const regularSpace = await SpaceFactory.regular(workspace);

      const internalServer = await InternalMCPServerInMemoryResource.makeNew(
        adminAuth,
        {
          name: "image_generation",
          useCase: null,
        }
      );
      const globalView = await MCPServerViewFactory.create(
        workspace,
        internalServer.id,
        globalSpace
      );
      const regularView = await MCPServerViewFactory.create(
        workspace,
        internalServer.id,
        regularSpace
      );

      const globalSpaceFetch = vi.spyOn(
        SpaceResource,
        "fetchWorkspaceGlobalSpace"
      );
      const spacesFetch = vi.spyOn(SpaceResource, "fetchByIds");

      try {
        const views = await MCPServerViewResource.listBySpaceIds(
          adminAuth,
          [regularSpace.sId],
          { includeGlobalSpace: true }
        );

        expect(views.map((v) => v.sId).sort()).toEqual(
          [globalView.sId, regularView.sId].sort()
        );
        expect(globalSpaceFetch).not.toHaveBeenCalled();
        expect(spacesFetch).not.toHaveBeenCalled();
      } finally {
        globalSpaceFetch.mockRestore();
        spacesFetch.mockRestore();
      }
    });

    it("returns only global views for empty space ids with includeGlobalSpace", async () => {
      const workspace = await WorkspaceFactory.basic();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const { globalSpace } = await SpaceFactory.defaults(adminAuth);
      const regularSpace = await SpaceFactory.regular(workspace);

      const internalServer = await InternalMCPServerInMemoryResource.makeNew(
        adminAuth,
        {
          name: "image_generation",
          useCase: null,
        }
      );
      const globalView = await MCPServerViewFactory.create(
        workspace,
        internalServer.id,
        globalSpace
      );
      await MCPServerViewFactory.create(
        workspace,
        internalServer.id,
        regularSpace
      );

      // The run_model.ts shape: list the global space views only.
      const globalOnly = await MCPServerViewResource.listBySpaceIds(
        adminAuth,
        [],
        { includeGlobalSpace: true }
      );
      expect(globalOnly.map((v) => v.sId)).toEqual([globalView.sId]);

      const none = await MCPServerViewResource.listBySpaceIds(adminAuth, []);
      expect(none).toHaveLength(0);
    });

    it("filters out views from spaces the user cannot read", async () => {
      const workspace = await WorkspaceFactory.basic();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const { globalSpace } = await SpaceFactory.defaults(adminAuth);
      const restrictedSpace = await SpaceFactory.regular(workspace);

      const internalServer = await InternalMCPServerInMemoryResource.makeNew(
        adminAuth,
        {
          name: "image_generation",
          useCase: null,
        }
      );
      const globalView = await MCPServerViewFactory.create(
        workspace,
        internalServer.id,
        globalSpace
      );
      const restrictedView = await MCPServerViewFactory.create(
        workspace,
        internalServer.id,
        restrictedSpace
      );

      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "user" });
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const views = await MCPServerViewResource.listBySpaceIds(
        userAuth,
        [restrictedSpace.sId],
        { includeGlobalSpace: true }
      );

      expect(views.map((v) => v.sId)).toEqual([globalView.sId]);
      expect(views.map((v) => v.sId)).not.toContain(restrictedView.sId);
    });

    it("ignores spaces from other workspaces", async () => {
      const workspace1 = await WorkspaceFactory.basic();
      const workspace2 = await WorkspaceFactory.basic();
      const adminAuth1 = await Authenticator.internalAdminForWorkspace(
        workspace1.sId
      );
      const adminAuth2 = await Authenticator.internalAdminForWorkspace(
        workspace2.sId
      );
      await SpaceFactory.defaults(adminAuth1);
      await SpaceFactory.defaults(adminAuth2);
      const foreignSpace = await SpaceFactory.regular(workspace2);

      const internalServer2 = await InternalMCPServerInMemoryResource.makeNew(
        adminAuth2,
        {
          name: "image_generation",
          useCase: null,
        }
      );
      await MCPServerViewFactory.create(
        workspace2,
        internalServer2.id,
        foreignSpace
      );

      const views = await MCPServerViewResource.listBySpaceIds(adminAuth1, [
        foreignSpace.sId,
      ]);
      expect(views).toHaveLength(0);
    });
  });

  describe("internal MCP server resolution", () => {
    it("resolves auto server views without fetching the system space", async () => {
      const workspace = await WorkspaceFactory.basic();
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      const { globalSpace } = await SpaceFactory.defaults(auth);
      const internalServer = await InternalMCPServerInMemoryResource.makeNew(
        auth,
        {
          name: "image_generation",
          useCase: null,
        }
      );
      const globalView = await MCPServerViewFactory.create(
        workspace,
        internalServer.id,
        globalSpace
      );
      const systemSpaceFetch = vi.spyOn(
        SpaceResource,
        "fetchWorkspaceSystemSpace"
      );

      try {
        const fetchedView = await MCPServerViewResource.fetchById(
          auth,
          globalView.sId
        );

        expect(fetchedView?.sId).toBe(globalView.sId);
        expect(systemSpaceFetch).not.toHaveBeenCalled();
      } finally {
        systemSpaceFetch.mockRestore();
      }
    });

    it("only resolves manual servers with a live system-space view", async () => {
      const workspace = await WorkspaceFactory.basic();
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      await SpaceFactory.defaults(auth);
      const regularSpace = await SpaceFactory.regular(workspace);
      const internalServer = await InternalMCPServerInMemoryResource.makeNew(
        auth,
        {
          name: "github",
          useCase: null,
        }
      );
      const regularView = await MCPServerViewFactory.create(
        workspace,
        internalServer.id,
        regularSpace
      );

      expect(
        await MCPServerViewResource.fetchById(auth, regularView.sId)
      ).not.toBeNull();

      const systemView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          auth,
          internalServer.id
        );
      expect(systemView).not.toBeNull();
      await systemView?.hardDelete(auth);

      expect(
        await MCPServerViewResource.fetchById(auth, regularView.sId)
      ).toBeNull();
    });
  });

  describe("ensureAllAutoToolsAreCreated", () => {
    let adminAuth: Authenticator;
    let mcpServerId: string;
    let workspace: WorkspaceType;

    beforeEach(async () => {
      // Create a workspace and admin auth.
      workspace = await WorkspaceFactory.basic();
      adminAuth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      // Ensure default spaces (system and global) exist.
      await SpaceFactory.defaults(adminAuth);

      // Call the function under test.
      await MCPServerViewResource.ensureAllAutoToolsAreCreated(adminAuth);

      // Build the internal MCP server sId for this workspace.
      mcpServerId = autoInternalMCPServerNameToSId({
        name: "common_utilities", // not an auto one
        workspaceId: workspace.id,
      });
    });

    it("creates system and global views for enabled auto internal servers", async () => {
      // Expect one view in system space and one in global space.
      const systemView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          adminAuth,
          mcpServerId
        );
      const globalView =
        await MCPServerViewResource.getMCPServerViewForGlobalSpace(
          adminAuth,
          mcpServerId
        );

      expect(systemView).not.toBeNull();
      expect(globalView).not.toBeNull();
    });

    it("tolerates concurrent creation races", async () => {
      const freshWorkspace = await WorkspaceFactory.basic();
      const freshAdminAuth = await Authenticator.internalAdminForWorkspace(
        freshWorkspace.sId
      );
      await SpaceFactory.defaults(freshAdminAuth);

      // Two concurrent calls race on the same inserts; the unique constraint
      // makes the loser a no-op instead of an error.
      await Promise.all([
        MCPServerViewResource.ensureAllAutoToolsAreCreated(freshAdminAuth),
        MCPServerViewResource.ensureAllAutoToolsAreCreated(freshAdminAuth),
      ]);

      const freshMCPServerId = autoInternalMCPServerNameToSId({
        name: "common_utilities",
        workspaceId: freshWorkspace.id,
      });
      const views = await MCPServerViewResource.listByMCPServer(
        freshAdminAuth,
        freshMCPServerId
      );
      expect(views).toHaveLength(2);
      expect(views.map((v) => v.space.kind).sort()).toEqual([
        "global",
        "system",
      ]);
    });
  });

  describe("unsafeEnsureAutoViewsForWorkspace", () => {
    it("only runs the underlying ensure once per workspace", async () => {
      const workspace = await WorkspaceFactory.basic();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await SpaceFactory.defaults(adminAuth);

      const ensureSpy = vi.spyOn(
        MCPServerViewResource,
        "ensureAllAutoToolsAreCreated"
      );

      await MCPServerViewResource.unsafeEnsureAutoViewsForWorkspace(adminAuth);
      await MCPServerViewResource.unsafeEnsureAutoViewsForWorkspace(adminAuth);

      expect(ensureSpy).toHaveBeenCalledTimes(1);
      ensureSpy.mockRestore();
    });

    it("creates missing auto views on reads from a regular member", async () => {
      const workspace = await WorkspaceFactory.basic();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await SpaceFactory.defaults(adminAuth);

      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "user" });
      const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      // No views exist yet; the member read hydrates them just in time.
      const view =
        await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
          memberAuth,
          "common_utilities"
        );

      expect(view).not.toBeNull();
      expect(view?.space.kind).toBe("global");
    });
  });

  describe("display and tool metadata", () => {
    let workspace: WorkspaceType;
    let adminAuth: Authenticator;

    beforeEach(async () => {
      workspace = await WorkspaceFactory.basic();
      adminAuth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      await SpaceFactory.defaults(adminAuth);
      await FeatureFlagFactory.basic(adminAuth, "http_client_tool");
    });

    it("lists display metadata for internal and remote servers", async () => {
      const internalServer = await InternalMCPServerInMemoryResource.makeNew(
        adminAuth,
        { name: "ashby", useCase: null }
      );
      const remoteServer = await RemoteMCPServerFactory.create(workspace);

      const metadata =
        await MCPServerViewResource.listDisplayMetadataByWorkspace(adminAuth);

      expect(metadata).toContainEqual({
        serverType: "internal",
        viewName: null,
        mcpServerId: internalServer.id,
        serverName: internalServer.toJSON().name,
        icon: internalServer.toJSON().icon,
      });
      expect(metadata).toContainEqual({
        serverType: "remote",
        viewName: null,
        mcpServerId: remoteServer.sId,
        serverName: remoteServer.cachedName,
        icon: remoteServer.icon,
      });
    });

    it("should populate toolsMetadata for internal server views", async () => {
      const originalConfig = INTERNAL_MCP_SERVERS["http_client"];
      Object.defineProperty(INTERNAL_MCP_SERVERS, "http_client", {
        value: {
          ...originalConfig,
          availability: "auto",
          isRestricted: ({
            featureFlags,
          }: {
            plan: PlanType;
            featureFlags: WhitelistableFeature[];
          }) => !featureFlags.includes("http_client_tool"),
        },
        writable: true,
        configurable: true,
      });

      const internalServer = await InternalMCPServerInMemoryResource.makeNew(
        adminAuth,
        { name: "http_client", useCase: null }
      );

      // Create tool metadata for the internal server.
      await RemoteMCPServerToolMetadataModel.create({
        workspaceId: workspace.id,
        internalMCPServerId: internalServer.id,
        toolName: "test_tool",
        permission: "low",
        enabled: true,
      });
      await RemoteMCPServerToolMetadataModel.create({
        workspaceId: workspace.id,
        internalMCPServerId: internalServer.id,
        toolName: "disabled_tool",
        permission: "high",
        enabled: false,
      });

      // Fetch the system view through baseFetch (via listForSystemSpace).
      const views = await MCPServerViewResource.listForSystemSpace(adminAuth);
      const view = views.find(
        (v) => v.internalMCPServerId === internalServer.id
      );
      expect(view).toBeDefined();

      const json = view!.toJSON();
      expect(json.toolsMetadata).toHaveLength(2);
      expect(json.toolsMetadata).toEqual(
        expect.arrayContaining([
          { toolName: "test_tool", permission: "low", enabled: true },
          { toolName: "disabled_tool", permission: "high", enabled: false },
        ])
      );
    });

    it("should populate toolsMetadata for remote server views", async () => {
      const remoteServer = await RemoteMCPServerFactory.create(workspace);

      // Create tool metadata for the remote server.
      await RemoteMCPServerToolMetadataModel.create({
        workspaceId: workspace.id,
        remoteMCPServerId: remoteServer.id,
        toolName: "remote_tool",
        permission: "medium",
        enabled: true,
      });

      // Fetch the system view through baseFetch.
      const view = await MCPServerViewResource.getMCPServerViewForSystemSpace(
        adminAuth,
        remoteServer.sId,
        {
          includeHeavyAttributes: [
            "authorization",
            "cachedTools",
            "customHeaders",
            "lastError",
            "sharedSecret",
          ],
        }
      );
      expect(view).not.toBeNull();

      const json = view!.toJSON();
      expect(json.toolsMetadata).toHaveLength(1);
      expect(json.toolsMetadata?.[0]).toEqual({
        toolName: "remote_tool",
        permission: "medium",
        enabled: true,
      });
    });

    it("should return empty toolsMetadata when no metadata exists", async () => {
      const remoteServer = await RemoteMCPServerFactory.create(workspace);

      const view = await MCPServerViewResource.getMCPServerViewForSystemSpace(
        adminAuth,
        remoteServer.sId,
        {
          includeHeavyAttributes: [
            "authorization",
            "cachedTools",
            "customHeaders",
            "lastError",
            "sharedSecret",
          ],
        }
      );
      expect(view).not.toBeNull();

      const json = view!.toJSON();
      expect(json.toolsMetadata).toEqual([]);
    });
  });

  describe("feature-flag enforcement", () => {
    it("drops views for restricted internal servers unless includeRestricted is set", async () => {
      const workspace = await WorkspaceFactory.basic();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await SpaceFactory.defaults(adminAuth);
      const globalSpace =
        await SpaceResource.fetchWorkspaceGlobalSpace(adminAuth);

      // Gate http_client behind a flag, and grant it so the server
      // and its views can be created — simulating a workspace that had the flag.
      const originalConfig = INTERNAL_MCP_SERVERS["http_client"];
      Object.defineProperty(INTERNAL_MCP_SERVERS, "http_client", {
        value: {
          ...originalConfig,
          availability: "auto",
          isRestricted: ({
            featureFlags,
          }: {
            plan: PlanType;
            featureFlags: WhitelistableFeature[];
          }) => !featureFlags.includes("http_client_tool"),
        },
        writable: true,
        configurable: true,
      });
      await FeatureFlagFactory.basic(adminAuth, "http_client_tool");

      const internalServer = await InternalMCPServerInMemoryResource.makeNew(
        adminAuth,
        { name: "http_client", useCase: null }
      );
      const view = await MCPServerViewFactory.create(
        workspace,
        internalServer.id,
        globalSpace
      );

      // The flag is turned off: the view now resolves to a restricted server.
      Object.defineProperty(INTERNAL_MCP_SERVERS, "http_client", {
        value: {
          ...originalConfig,
          availability: "auto",
          isRestricted: () => true,
        },
        writable: true,
        configurable: true,
      });

      // Default: the restricted view is not resolved into a runnable tool.
      expect(
        await MCPServerViewResource.fetchById(adminAuth, view.sId)
      ).toBeNull();
      expect(
        await MCPServerViewResource.fetchByIds(adminAuth, [view.sId])
      ).toEqual([]);

      // Opt-in: admin surfaces can still surface it for management.
      const surfaced = await MCPServerViewResource.fetchById(
        adminAuth,
        view.sId,
        { includeRestricted: true }
      );
      expect(surfaced).not.toBeNull();
      expect(surfaced!.sId).toBe(view.sId);

      Object.defineProperty(INTERNAL_MCP_SERVERS, "http_client", {
        value: originalConfig,
        writable: true,
        configurable: true,
      });
    });
  });
});
