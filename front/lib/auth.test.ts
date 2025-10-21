import { beforeEach, describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import type { GroupResource } from "@app/lib/resources/group_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { ResourcePermission, WorkspaceType } from "@app/types";

import { setupWorkOSMocks } from "../tests/utils/mocks/workos";

// Setup WorkOS mocks
setupWorkOSMocks();

describe("Authenticator.hasResourcePermission", () => {
  let workspace: WorkspaceType;
  let otherWorkspace: WorkspaceType;
  let user: UserResource;
  let globalGroup: GroupResource;
  let globalSpace: SpaceResource;
  let regularSpace: SpaceResource;
  let authenticator: Authenticator;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    otherWorkspace = await WorkspaceFactory.basic();

    await FeatureFlagFactory.basic("use_requested_spaces", workspace);

    user = await UserFactory.basic();

    const adminAuthenticator = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    // Create membership for user in workspace
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const { globalGroup: gg, globalSpace: gs } =
      await SpaceFactory.defaults(adminAuthenticator);
    globalSpace = gs;
    globalGroup = gg;

    const rs = await SpaceFactory.regular(workspace);
    regularSpace = rs;

    // Add user to regular space group
    await rs.groups[0].addMembers(adminAuthenticator, [user.toJSON()]);

    authenticator = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
  });

  describe("Role-based permissions", () => {
    it("should grant access when user has matching role for their workspace", () => {
      const resourcePermission: ResourcePermission = {
        workspaceId: workspace.id,
        roles: [
          { role: "user", permissions: ["read"] },
          { role: "builder", permissions: ["read", "write"] },
        ],
        groups: [],
      };

      // User role should have read permission
      expect(authenticator.canRead([resourcePermission])).toBe(true);
      expect(authenticator.canWrite([resourcePermission])).toBe(false);
    });

    it("should deny access when user role doesn't have required permission", () => {
      const resourcePermission: ResourcePermission = {
        workspaceId: workspace.id,
        roles: [
          { role: "builder", permissions: ["read", "write"] },
          { role: "admin", permissions: ["read", "write", "admin"] },
        ],
        groups: [],
      };

      // User role not listed, should deny access
      expect(authenticator.canRead([resourcePermission])).toBe(false);
      expect(authenticator.canWrite([resourcePermission])).toBe(false);
    });

    it("should deny access when resource belongs to different workspace", () => {
      const resourcePermission: ResourcePermission = {
        workspaceId: otherWorkspace.id,
        roles: [{ role: "user", permissions: ["read", "write", "admin"] }],
        groups: [],
      };

      // Same role but different workspace, should deny access
      expect(authenticator.canRead([resourcePermission])).toBe(false);
      expect(authenticator.canWrite([resourcePermission])).toBe(false);
    });

    it("should grant public access when role is 'none'", () => {
      const resourcePermission: ResourcePermission = {
        workspaceId: otherWorkspace.id, // Different workspace
        roles: [
          { role: "none", permissions: ["read"] },
          { role: "user", permissions: ["write"] },
        ],
        groups: [],
      };

      // Public read access should work across workspaces
      expect(authenticator.canRead([resourcePermission])).toBe(true);
      // But write should be denied (different workspace, user role)
      expect(authenticator.canWrite([resourcePermission])).toBe(false);
    });
  });

  describe("Group-based permissions", () => {
    it("should grant access when user belongs to group with permission", () => {
      const resourcePermission: ResourcePermission = {
        groups: [
          {
            id: globalGroup.id,
            permissions: ["read", "write"],
          },
        ],
      };

      expect(authenticator.canRead([resourcePermission])).toBe(true);
      expect(authenticator.canWrite([resourcePermission])).toBe(true);
      expect(authenticator.canAdministrate([resourcePermission])).toBe(false);
    });

    it("should deny access when user doesn't belong to any authorized group", () => {
      const resourcePermission: ResourcePermission = {
        groups: [
          {
            id: 99999, // Non-existent group ID
            permissions: ["read", "write", "admin"],
          },
        ],
      };

      expect(authenticator.canRead([resourcePermission])).toBe(false);
      expect(authenticator.canWrite([resourcePermission])).toBe(false);
      expect(authenticator.canAdministrate([resourcePermission])).toBe(false);
    });

    it("should deny access when user's group lacks required permission", () => {
      const resourcePermission: ResourcePermission = {
        groups: [
          {
            id: globalGroup.id,
            permissions: ["read"], // Only read permission
          },
        ],
      };

      expect(authenticator.canRead([resourcePermission])).toBe(true);
      expect(authenticator.canWrite([resourcePermission])).toBe(false);
      expect(authenticator.canAdministrate([resourcePermission])).toBe(false);
    });
  });

  describe("Space-based permissions", () => {
    it("should grant access for global space with permission", () => {
      const resourcePermission: ResourcePermission = {
        space: {
          id: globalSpace.id,
          permissions: ["read", "write"],
        },
      };

      expect(authenticator.canRead([resourcePermission])).toBe(true);
      expect(authenticator.canWrite([resourcePermission])).toBe(true);
      expect(authenticator.canAdministrate([resourcePermission])).toBe(false);
    });

    it("should deny access when user doesn't belong to space", () => {
      const resourcePermission: ResourcePermission = {
        space: {
          id: 99999, // Non-existent space ID
          permissions: ["read", "write", "admin"],
        },
      };

      expect(authenticator.canRead([resourcePermission])).toBe(false);
      expect(authenticator.canWrite([resourcePermission])).toBe(false);
      expect(authenticator.canAdministrate([resourcePermission])).toBe(false);
    });

    it("should grant access when user belongs to regular space with permission", () => {
      const resourcePermission: ResourcePermission = {
        space: {
          id: regularSpace.id,
          permissions: ["read", "write"],
        },
      };

      expect(authenticator.canRead([resourcePermission])).toBe(true);
      expect(authenticator.canWrite([resourcePermission])).toBe(true);
      expect(authenticator.canAdministrate([resourcePermission])).toBe(false);
    });
  });

  describe("Mixed permission types", () => {
    it("should grant access when any permission type matches (OR logic)", () => {
      const resourcePermission: ResourcePermission = {
        // Role permission that would deny (wrong workspace)
        workspaceId: otherWorkspace.id,
        roles: [{ role: "admin", permissions: ["write"] }],
        // Group permission that would grant
        groups: [{ id: globalGroup.id, permissions: ["read"] }],
        // Space permission that would deny
        space: { id: 99999, permissions: ["write"] },
      };

      // Should grant because group permission matches
      expect(authenticator.canRead([resourcePermission])).toBe(true);
      expect(authenticator.canWrite([resourcePermission])).toBe(false);
    });

    it("should deny when no permission types match", () => {
      const resourcePermission: ResourcePermission = {
        workspaceId: otherWorkspace.id,
        roles: [{ role: "admin", permissions: ["write"] }],
        groups: [{ id: 99999, permissions: ["read"] }],
        space: { id: 99999, permissions: ["write"] },
      };

      expect(authenticator.canRead([resourcePermission])).toBe(false);
      expect(authenticator.canWrite([resourcePermission])).toBe(false);
    });
  });

  describe("Multiple resource permissions (AND logic)", () => {
    it("should require permission on ALL resources", () => {
      const resourcePermissions: ResourcePermission[] = [
        {
          groups: [{ id: globalGroup.id, permissions: ["read", "write"] }],
        },
        {
          groups: [{ id: globalGroup.id, permissions: ["read", "write"] }],
        },
      ];

      // User has access to both resources
      expect(authenticator.canRead(resourcePermissions)).toBe(true);
      expect(authenticator.canWrite(resourcePermissions)).toBe(true);
    });

    it("should deny when user lacks permission on any resource", () => {
      const resourcePermissions: ResourcePermission[] = [
        {
          groups: [{ id: globalGroup.id, permissions: ["read", "write"] }],
        },
        {
          groups: [{ id: 99999, permissions: ["read", "write"] }], // No access
        },
      ];

      // User lacks access to second resource
      expect(authenticator.canRead(resourcePermissions)).toBe(false);
      expect(authenticator.canWrite(resourcePermissions)).toBe(false);
    });

    it("should handle empty resource permissions array", () => {
      // Empty array should grant access (vacuous truth)
      expect(authenticator.canRead([])).toBe(true);
      expect(authenticator.canWrite([])).toBe(true);
      expect(authenticator.canAdministrate([])).toBe(true);
    });
  });

  describe("Builder role permissions", () => {
    let builderAuth: Authenticator;

    beforeEach(async () => {
      builderAuth = await Authenticator.internalBuilderForWorkspace(
        workspace.sId
      );
    });

    it("should grant builder role appropriate permissions", () => {
      const resourcePermission: ResourcePermission = {
        workspaceId: workspace.id,
        roles: [
          { role: "user", permissions: ["read"] },
          { role: "builder", permissions: ["read", "write"] },
          { role: "admin", permissions: ["read", "write", "admin"] },
        ],
        groups: [],
      };

      expect(builderAuth.canRead([resourcePermission])).toBe(true);
      expect(builderAuth.canWrite([resourcePermission])).toBe(true);
      expect(builderAuth.canAdministrate([resourcePermission])).toBe(false);
    });
  });

  describe("Admin role permissions", () => {
    let adminAuth: Authenticator;

    beforeEach(async () => {
      adminAuth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    });

    it("should grant admin role all permissions", () => {
      const resourcePermission: ResourcePermission = {
        workspaceId: workspace.id,
        roles: [
          { role: "user", permissions: ["read"] },
          { role: "builder", permissions: ["read", "write"] },
          { role: "admin", permissions: ["read", "write", "admin"] },
        ],
        groups: [],
      };

      expect(adminAuth.canRead([resourcePermission])).toBe(true);
      expect(adminAuth.canWrite([resourcePermission])).toBe(true);
      expect(adminAuth.canAdministrate([resourcePermission])).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("should handle resource permission with empty groups array", () => {
      const resourcePermission: ResourcePermission = {
        groups: [],
      };

      expect(authenticator.canRead([resourcePermission])).toBe(false);
      expect(authenticator.canWrite([resourcePermission])).toBe(false);
    });

    it("should handle resource permission with empty roles array", () => {
      const resourcePermission: ResourcePermission = {
        workspaceId: workspace.id,
        roles: [],
        groups: [],
      };

      expect(authenticator.canRead([resourcePermission])).toBe(false);
      expect(authenticator.canWrite([resourcePermission])).toBe(false);
    });

    it("should handle group with empty permissions array", () => {
      const resourcePermission: ResourcePermission = {
        groups: [
          {
            id: globalGroup.id,
            permissions: [],
          },
        ],
      };

      expect(authenticator.canRead([resourcePermission])).toBe(false);
      expect(authenticator.canWrite([resourcePermission])).toBe(false);
    });
  });
});
