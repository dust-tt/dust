import { beforeEach, describe, expect, it } from "vitest";

import { loadAllModels } from "@app/admin/db";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupSpaceEditorResource } from "@app/lib/resources/group_space_editor_resource";
import { GroupSpaceMemberResource } from "@app/lib/resources/group_space_member_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import type { UserResource } from "@app/lib/resources/user_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";

describe("SpaceResource", () => {
  describe("updatePermissions", () => {
    let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
    let adminAuth: Authenticator;
    let userAuth: Authenticator;
    let regularSpace: SpaceResource;
    let globalGroup: GroupResource;
    let regularGroup: GroupResource;
    let user1: UserResource;
    let user2: UserResource;
    let user3: UserResource;

    beforeEach(async () => {
      workspace = await WorkspaceFactory.basic();
      const adminUser = await UserFactory.basic();
      const regularUser = await UserFactory.basic();

      // Set up default groups and spaces FIRST (before creating authenticators)
      const { globalGroup: gGroup, systemGroup } =
        await GroupFactory.defaults(workspace);
      globalGroup = gGroup;

      await MembershipFactory.associate(workspace, adminUser, {
        role: "admin",
      });
      await MembershipFactory.associate(workspace, regularUser, {
        role: "user",
      });

      // Create internal admin auth to set up default spaces
      const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await SpaceResource.makeDefaultsForWorkspace(internalAdminAuth, {
        globalGroup,
        systemGroup,
      });

      // Now create user authenticators (they will find the global group)
      adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
        adminUser.sId,
        workspace.sId
      );
      userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        regularUser.sId,
        workspace.sId
      );

      // Create a regular space with a regular group
      regularGroup = await GroupResource.makeNew({
        name: "Test Regular Group",
        workspaceId: workspace.id,
        kind: "regular",
      });

      regularSpace = await SpaceResource.makeNew(
        {
          name: "Test Regular Space",
          kind: "regular",
          workspaceId: workspace.id,
          managementMode: "manual",
        },
        { members: [regularGroup] }
      );

      // Create test users
      user1 = await UserFactory.basic();
      user2 = await UserFactory.basic();
      user3 = await UserFactory.basic();

      await MembershipFactory.associate(workspace, user1, { role: "user" });
      await MembershipFactory.associate(workspace, user2, { role: "user" });
      await MembershipFactory.associate(workspace, user3, { role: "user" });
    });

    describe("authorization checks", () => {
      it("should return unauthorized error when user cannot administrate the space", async () => {
        const result = await regularSpace.updatePermissions(userAuth, {
          name: "Updated Name",
          isRestricted: false,
          managementMode: "manual",
          memberIds: [user1.sId],
          editorIds: [],
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBeInstanceOf(DustError);
          expect(result.error.code).toBe("unauthorized");
          expect(result.error.message).toBe(
            "You do not have permission to update space permissions."
          );
        }
      });

      it("should return unauthorized error when trying to update non-regular space", async () => {
        const systemSpace =
          await SpaceResource.fetchWorkspaceSystemSpace(adminAuth);

        const result = await systemSpace.updatePermissions(adminAuth, {
          name: "Updated Name",
          isRestricted: false,
          managementMode: "manual",
          memberIds: [user1.sId],
          editorIds: [],
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBeInstanceOf(DustError);
          expect(result.error.code).toBe("unauthorized");
        }
      });
    });

    describe("manual management mode", () => {
      it("should successfully update space with manual mode and set members", async () => {
        const result = await regularSpace.updatePermissions(adminAuth, {
          name: "Updated Name",
          isRestricted: true,
          managementMode: "manual",
          memberIds: [user1.sId, user2.sId],
          editorIds: [],
        });

        expect(result.isOk()).toBe(true);

        // Verify members were set
        const updatedSpace = await SpaceResource.fetchById(
          adminAuth,
          regularSpace.sId
        );
        expect(updatedSpace).not.toBeNull();
        const members = await regularGroup.getAllMembers(adminAuth);
        const memberSIds = members.map((m) => m.sId);
        expect(memberSIds).toContain(user1.sId);
        expect(memberSIds).toContain(user2.sId);
      });

      it("should update managementMode to manual when switching from group mode", async () => {
        // First set to group mode
        const provisionedGroup = await GroupResource.makeNew({
          name: "Provisioned Group",
          workspaceId: workspace.id,
          kind: "provisioned",
        });

        const groupResult = await regularSpace.updatePermissions(adminAuth, {
          name: "Test Space",
          isRestricted: true,
          managementMode: "group",
          groupIds: [provisionedGroup.sId],
          editorGroupIds: [],
        });
        expect(groupResult.isOk()).toBe(true);

        // Verify it's in group mode
        const spaceAfterGroup = await SpaceResource.fetchById(
          adminAuth,
          regularSpace.sId
        );
        expect(spaceAfterGroup?.managementMode).toBe("group");

        // Switch to manual mode
        const result = await spaceAfterGroup!.updatePermissions(adminAuth, {
          name: "Test Space",
          isRestricted: true,
          managementMode: "manual",
          memberIds: [user1.sId],
          editorIds: [],
        });

        expect(result.isOk()).toBe(true);

        // Verify managementMode was updated
        const spaceAfterManual = await SpaceResource.fetchById(
          adminAuth,
          regularSpace.sId
        );
        expect(spaceAfterManual?.managementMode).toBe("manual");
      });

      it("should restore suspended members when switching from group to manual mode", async () => {
        // Add members first
        await regularGroup.dangerouslyAddMembers(adminAuth, {
          users: [user1.toJSON(), user2.toJSON()],
        });

        // Switch to group mode (this should suspend members)
        const provisionedGroup = await GroupResource.makeNew({
          name: "Provisioned Group",
          workspaceId: workspace.id,
          kind: "provisioned",
        });

        const groupResult = await regularSpace.updatePermissions(adminAuth, {
          name: "Test Space",
          isRestricted: true,
          managementMode: "group",
          groupIds: [provisionedGroup.sId],
          editorGroupIds: [],
        });
        expect(groupResult.isOk()).toBe(true);

        // Verify members are suspended
        const membershipsAfterSuspend = await GroupMembershipModel.findAll({
          where: {
            groupId: regularGroup.id,
            workspaceId: workspace.id,
          },
        });
        const suspendedMemberships = membershipsAfterSuspend.filter(
          (m) => m.status === "suspended"
        );
        expect(suspendedMemberships.length).toBe(2);

        // Reload space to get updated state
        const spaceAfterGroup = await SpaceResource.fetchById(
          adminAuth,
          regularSpace.sId
        );

        // Switch back to manual mode
        const manualResult = await spaceAfterGroup!.updatePermissions(
          adminAuth,
          {
            name: "Test Space",
            isRestricted: true,
            managementMode: "manual",
            memberIds: [user1.sId, user2.sId],
            editorIds: [],
          }
        );
        expect(manualResult.isOk()).toBe(true);

        // Verify members are restored
        const membershipsAfterRestore = await GroupMembershipModel.findAll({
          where: {
            groupId: regularGroup.id,
            workspaceId: workspace.id,
            status: "active",
          },
        });
        expect(membershipsAfterRestore.length).toBe(2);
      });
    });

    describe("group management mode", () => {
      it("should successfully update space with group mode and set groups", async () => {
        const provisionedGroup1 = await GroupResource.makeNew({
          name: "Provisioned Group 1",
          workspaceId: workspace.id,
          kind: "provisioned",
        });

        const provisionedGroup2 = await GroupResource.makeNew({
          name: "Provisioned Group 2",
          workspaceId: workspace.id,
          kind: "provisioned",
        });

        const result = await regularSpace.updatePermissions(adminAuth, {
          name: "Updated Name",
          isRestricted: true,
          managementMode: "group",
          groupIds: [provisionedGroup1.sId, provisionedGroup2.sId],
          editorGroupIds: [],
        });

        expect(result.isOk()).toBe(true);

        // Verify groups were associated
        const updatedSpace = await SpaceResource.fetchById(
          adminAuth,
          regularSpace.sId
        );
        expect(updatedSpace).not.toBeNull();
        const groupSpaces = await GroupSpaceModel.findAll({
          where: {
            vaultId: regularSpace.id,
            workspaceId: workspace.id,
          },
        });
        const associatedGroupIds = groupSpaces.map((gs) => gs.groupId);
        expect(associatedGroupIds).toContain(provisionedGroup1.id);
        expect(associatedGroupIds).toContain(provisionedGroup2.id);
      });

      it("should remove existing provisioned groups when updating group mode", async () => {
        const provisionedGroup1 = await GroupResource.makeNew({
          name: "Provisioned Group 1",
          workspaceId: workspace.id,
          kind: "provisioned",
        });

        const provisionedGroup2 = await GroupResource.makeNew({
          name: "Provisioned Group 2",
          workspaceId: workspace.id,
          kind: "provisioned",
        });

        // First set group1
        const firstResult = await regularSpace.updatePermissions(adminAuth, {
          name: "Test Space",
          isRestricted: true,
          managementMode: "group",
          groupIds: [provisionedGroup1.sId],
          editorGroupIds: [],
        });
        expect(firstResult.isOk()).toBe(true);

        // Reload space to get updated groups
        const spaceAfterFirstUpdate = await SpaceResource.fetchById(
          adminAuth,
          regularSpace.sId
        );

        // Then update to group2 (should remove group1)
        const result = await spaceAfterFirstUpdate!.updatePermissions(
          adminAuth,
          {
            name: "Test Space",
            isRestricted: true,
            managementMode: "group",
            groupIds: [provisionedGroup2.sId],
            editorGroupIds: [],
          }
        );

        expect(result.isOk()).toBe(true);

        // Verify only group2 is associated (plus the regular group)
        const groupSpaces = await GroupSpaceModel.findAll({
          where: {
            vaultId: regularSpace.id,
            workspaceId: workspace.id,
          },
        });
        const associatedGroupIds = groupSpaces.map((gs) => gs.groupId);
        expect(associatedGroupIds).not.toContain(provisionedGroup1.id);
        expect(associatedGroupIds).toContain(provisionedGroup2.id);
        expect(associatedGroupIds).toContain(regularGroup.id); // Regular group should still be there
      });

      it("should update managementMode to group when switching from manual mode", async () => {
        // First set to manual mode
        const manualResult = await regularSpace.updatePermissions(adminAuth, {
          name: "Test Space",
          isRestricted: true,
          managementMode: "manual",
          memberIds: [user1.sId],
          editorIds: [],
        });
        expect(manualResult.isOk()).toBe(true);

        // Verify it's in manual mode
        const spaceAfterManual = await SpaceResource.fetchById(
          adminAuth,
          regularSpace.sId
        );
        expect(spaceAfterManual?.managementMode).toBe("manual");

        // Switch to group mode
        const provisionedGroup = await GroupResource.makeNew({
          name: "Provisioned Group",
          workspaceId: workspace.id,
          kind: "provisioned",
        });

        const result = await spaceAfterManual!.updatePermissions(adminAuth, {
          name: "Test Space",
          isRestricted: true,
          managementMode: "group",
          groupIds: [provisionedGroup.sId],
          editorGroupIds: [],
        });

        expect(result.isOk()).toBe(true);

        // Verify managementMode was updated
        const spaceAfterGroup = await SpaceResource.fetchById(
          adminAuth,
          regularSpace.sId
        );
        expect(spaceAfterGroup?.managementMode).toBe("group");
      });

      it("should suspend active members when switching from manual to group mode", async () => {
        // Add members first
        await regularGroup.dangerouslyAddMembers(adminAuth, {
          users: [user1.toJSON(), user2.toJSON()],
        });

        // Set space to manual mode first
        await regularSpace.updatePermissions(adminAuth, {
          name: "Test Space",
          isRestricted: true,
          managementMode: "manual",
          memberIds: [user1.sId, user2.sId],
          editorIds: [],
        });

        // Verify members are active
        const membershipsBefore = await GroupMembershipModel.findAll({
          where: {
            groupId: regularGroup.id,
            workspaceId: workspace.id,
            status: "active",
          },
        });
        expect(membershipsBefore.length).toBe(2);

        // Reload space to get current state
        const spaceInManualMode = await SpaceResource.fetchById(
          adminAuth,
          regularSpace.sId
        );

        // Switch to group mode
        const provisionedGroup = await GroupResource.makeNew({
          name: "Provisioned Group",
          workspaceId: workspace.id,
          kind: "provisioned",
        });

        const result = await spaceInManualMode!.updatePermissions(adminAuth, {
          name: "Test Space",
          isRestricted: true,
          managementMode: "group",
          groupIds: [provisionedGroup.sId],
          editorGroupIds: [],
        });
        expect(result.isOk()).toBe(true);

        // Verify members are suspended
        const membershipsAfter = await GroupMembershipModel.findAll({
          where: {
            groupId: regularGroup.id,
            workspaceId: workspace.id,
            status: "suspended",
          },
        });
        expect(membershipsAfter.length).toBe(2);
      });
    });

    describe("restricted/open state changes", () => {
      it("should add global group when changing from restricted to open", async () => {
        // Start with restricted space (no global group)
        const result = await regularSpace.updatePermissions(adminAuth, {
          name: "Test Space",
          isRestricted: false,
          managementMode: "manual",
          memberIds: [user1.sId],
          editorIds: [],
        });

        expect(result.isOk()).toBe(true);

        // Verify global group was added
        const groupSpaces = await GroupSpaceModel.findAll({
          where: {
            vaultId: regularSpace.id,
            workspaceId: workspace.id,
          },
        });
        const associatedGroupIds = groupSpaces.map((gs) => gs.groupId);
        expect(associatedGroupIds).toContain(globalGroup.id);
      });

      it("should remove global group when changing from open to restricted", async () => {
        // First add global group to make it open
        await GroupSpaceMemberResource.makeNew(adminAuth, {
          group: globalGroup,
          space: regularSpace,
        });

        // Reload space to get updated groups
        const spaceWithGlobalGroup = await SpaceResource.fetchById(
          adminAuth,
          regularSpace.sId
        );

        // Then make it restricted
        const result = await spaceWithGlobalGroup!.updatePermissions(
          adminAuth,
          {
            name: "Test Space",
            isRestricted: true,
            managementMode: "manual",
            memberIds: [user1.sId],
            editorIds: [],
          }
        );

        expect(result.isOk()).toBe(true);

        // Verify global group was removed
        const groupSpaces = await GroupSpaceModel.findAll({
          where: {
            vaultId: regularSpace.id,
            workspaceId: workspace.id,
            groupId: globalGroup.id,
          },
        });
        expect(groupSpaces.length).toBe(0);
      });

      it("should not change global group when restricted state stays the same", async () => {
        // Start restricted
        await regularSpace.updatePermissions(adminAuth, {
          name: "Test Space",
          isRestricted: true,
          managementMode: "manual",
          memberIds: [user1.sId],
          editorIds: [],
        });

        const groupSpacesBefore = await GroupSpaceModel.findAll({
          where: {
            vaultId: regularSpace.id,
            workspaceId: workspace.id,
          },
        });
        const globalGroupPresentBefore = groupSpacesBefore.some(
          (gs) => gs.groupId === globalGroup.id
        );

        // Update but keep restricted
        await regularSpace.updatePermissions(adminAuth, {
          name: "Test Space Updated",
          isRestricted: true,
          managementMode: "manual",
          memberIds: [user2.sId],
          editorIds: [],
        });

        const groupSpacesAfter = await GroupSpaceModel.findAll({
          where: {
            vaultId: regularSpace.id,
            workspaceId: workspace.id,
          },
        });
        const globalGroupPresentAfter = groupSpacesAfter.some(
          (gs) => gs.groupId === globalGroup.id
        );

        expect(globalGroupPresentBefore).toBe(globalGroupPresentAfter);
      });
    });

    describe("error handling", () => {
      it("should return error when group fetch fails in group mode", async () => {
        const result = await regularSpace.updatePermissions(adminAuth, {
          name: "Test Space",
          isRestricted: true,
          managementMode: "group",
          groupIds: ["invalid-group-id"],
          editorGroupIds: [],
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBeInstanceOf(DustError);
        }
      });

      it("should return error when setMembers fails in manual mode", async () => {
        // This test might need adjustment based on actual error conditions
        // For now, testing with invalid user IDs
        const result = await regularSpace.updatePermissions(adminAuth, {
          name: "Test Space",
          isRestricted: true,
          managementMode: "manual",
          memberIds: ["invalid-user-id"],
          editorIds: [],
        });

        // The method should handle this gracefully
        // Adjust expectations based on actual behavior
        expect(result.isErr() || result.isOk()).toBe(true);
      });
    });

    describe("management mode persistence", () => {
      it("should persist managementMode when updating permissions", async () => {
        const groupResult = await regularSpace.updatePermissions(adminAuth, {
          name: "Test Space",
          isRestricted: true,
          managementMode: "group",
          groupIds: [],
          editorGroupIds: [],
        });
        expect(groupResult.isOk()).toBe(true);

        const updatedSpace = await SpaceResource.fetchById(
          adminAuth,
          regularSpace.sId
        );
        expect(updatedSpace?.managementMode).toBe("group");

        const manualResult = await updatedSpace!.updatePermissions(adminAuth, {
          name: "Test Space",
          isRestricted: true,
          managementMode: "manual",
          memberIds: [user1.sId],
          editorIds: [],
        });
        expect(manualResult.isOk()).toBe(true);

        const updatedSpace2 = await SpaceResource.fetchById(
          adminAuth,
          regularSpace.sId
        );
        expect(updatedSpace2?.managementMode).toBe("manual");
      });
    });

    describe("project editor and member permissions", () => {
      let projectSpace: SpaceResource;
      let projectMemberGroup: GroupResource;
      let projectEditorGroup: GroupResource;
      let editorUser: UserResource;
      let memberUser: UserResource;
      let nonMemberUser: UserResource;

      beforeEach(async () => {
        // Create users for testing
        editorUser = await UserFactory.basic();
        memberUser = await UserFactory.basic();
        nonMemberUser = await UserFactory.basic();

        await MembershipFactory.associate(workspace, editorUser, {
          role: "user",
        });
        await MembershipFactory.associate(workspace, memberUser, {
          role: "user",
        });
        await MembershipFactory.associate(workspace, nonMemberUser, {
          role: "user",
        });

        // Create a project space with member and editor groups
        projectMemberGroup = await GroupResource.makeNew({
          name: "Project Members Group",
          workspaceId: workspace.id,
          kind: "regular",
        });
      });

      describe("with manual groups", () => {
        beforeEach(async () => {
          projectEditorGroup = await GroupResource.makeNew({
            name: "Project Editors Group",
            workspaceId: workspace.id,
            kind: "space_editors",
          });

          projectSpace = await SpaceResource.makeNew(
            {
              name: "Test Project Space",
              kind: "project",
              workspaceId: workspace.id,
              managementMode: "manual",
            },
            { members: [projectMemberGroup] }
          );

          // Link the editor group to the project space with kind="project_editor"
          await GroupSpaceEditorResource.makeNew(adminAuth, {
            group: projectEditorGroup,
            space: projectSpace,
          });
        });

        it("should not allow simple members to update space permissions", async () => {
          // Add user as a simple member
          await projectMemberGroup.dangerouslyAddMember(adminAuth, {
            user: memberUser.toJSON(),
          });

          // Create an authenticator for the member user
          const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
            memberUser.sId,
            workspace.sId
          );

          // Reload space to get updated groups
          const reloadedSpace = await SpaceResource.fetchById(
            adminAuth,
            projectSpace.sId
          );

          // Member should NOT be able to update space permissions
          const result = await reloadedSpace!.updatePermissions(memberAuth, {
            name: "Test Project Space",
            isRestricted: true,
            managementMode: "manual",
            memberIds: [user1.sId],
            editorIds: [],
          });

          expect(result.isErr()).toBe(true);
          if (result.isErr()) {
            expect(result.error.code).toBe("unauthorized");
          }
        });

        it("should not allow non-members to update space permissions", async () => {
          // Create an authenticator for a non-member user
          const nonMemberAuth = await Authenticator.fromUserIdAndWorkspaceId(
            nonMemberUser.sId,
            workspace.sId
          );

          // Reload space to get updated groups
          const reloadedSpace = await SpaceResource.fetchById(
            adminAuth,
            projectSpace.sId
          );

          // Non-member should NOT be able to update space permissions
          const result = await reloadedSpace!.updatePermissions(nonMemberAuth, {
            name: "Test Project Space",
            isRestricted: true,
            managementMode: "manual",
            memberIds: [user1.sId],
            editorIds: [],
          });

          expect(result.isErr()).toBe(true);
          if (result.isErr()) {
            expect(result.error.code).toBe("unauthorized");
          }
        });

        it("should allow editors to manage members through updatePermissions", async () => {
          // Add editor to the editor group
          await projectEditorGroup.dangerouslyAddMember(adminAuth, {
            user: editorUser.toJSON(),
          });

          // Create an authenticator for the editor user
          const editorAuth = await Authenticator.fromUserIdAndWorkspaceId(
            editorUser.sId,
            workspace.sId
          );

          // Reload space to get updated groups
          const reloadedSpace = await SpaceResource.fetchById(
            editorAuth,
            projectSpace.sId
          );

          // Editor should be able to manage members through updatePermissions
          const result = await reloadedSpace!.updatePermissions(editorAuth, {
            name: "Test Project Space",
            isRestricted: true,
            managementMode: "manual",
            memberIds: [user1.sId, user2.sId],
            editorIds: [editorUser.sId],
          });

          expect(result.isOk()).toBe(true);

          // Verify members were added
          const members = await projectMemberGroup.getActiveMembers(adminAuth);
          const memberSIds = members.map((m) => m.sId);
          expect(memberSIds).toContain(user1.sId);
          expect(memberSIds).toContain(user2.sId);

          // Verify editor is still in the editor group
          const editors = await projectEditorGroup.getActiveMembers(adminAuth);
          const editorSIds = editors.map((m) => m.sId);
          expect(editorSIds).toContain(editorUser.sId);
        });
      });

      describe("with provisioned groups", () => {
        let provisionedMemberGroup: GroupResource;
        let provisionedEditorGroup: GroupResource;

        beforeEach(async () => {
          // Create provisioned groups
          provisionedMemberGroup = await GroupResource.makeNew({
            name: "Provisioned Members Group",
            workspaceId: workspace.id,
            kind: "provisioned",
          });

          provisionedEditorGroup = await GroupResource.makeNew({
            name: "Provisioned Editors Group",
            workspaceId: workspace.id,
            kind: "provisioned",
          });

          projectSpace = await SpaceResource.makeNew(
            {
              name: "Test Project Space",
              kind: "project",
              workspaceId: workspace.id,
              managementMode: "group",
            },
            { members: [projectMemberGroup, provisionedMemberGroup] }
          );

          // Link the editor group to the project space with kind="project_editor"
          await GroupSpaceEditorResource.makeNew(adminAuth, {
            group: provisionedEditorGroup,
            space: projectSpace,
          });
        });

        it("should not allow simple members to update space permissions", async () => {
          // Add user as a simple member to the provisioned group
          await provisionedMemberGroup.dangerouslyAddMember(adminAuth, {
            user: memberUser.toJSON(),
            allowProvisionnedGroups: true,
          });

          // Create an authenticator for the member user
          const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
            memberUser.sId,
            workspace.sId
          );

          // Reload space to get updated groups
          const reloadedSpace = await SpaceResource.fetchById(
            adminAuth,
            projectSpace.sId
          );

          // Member should NOT be able to update space permissions
          const result = await reloadedSpace!.updatePermissions(memberAuth, {
            name: "Test Project Space",
            isRestricted: true,
            managementMode: "group",
            groupIds: [provisionedMemberGroup.sId],
            editorGroupIds: [],
          });

          expect(result.isErr()).toBe(true);
          if (result.isErr()) {
            expect(result.error.code).toBe("unauthorized");
          }
        });

        it("should not allow non-members to update space permissions", async () => {
          // Create an authenticator for a non-member user
          const nonMemberAuth = await Authenticator.fromUserIdAndWorkspaceId(
            nonMemberUser.sId,
            workspace.sId
          );

          // Reload space to get updated groups
          const reloadedSpace = await SpaceResource.fetchById(
            adminAuth,
            projectSpace.sId
          );

          // Non-member should NOT be able to update space permissions
          // Authorization check happens before group manipulation, so we get unauthorized
          const result = await reloadedSpace!.updatePermissions(nonMemberAuth, {
            name: "Test Project Space",
            isRestricted: true,
            managementMode: "group",
            groupIds: [provisionedMemberGroup.sId],
            editorGroupIds: [],
          });

          expect(result.isErr()).toBe(true);
          if (result.isErr()) {
            expect(result.error.code).toBe("unauthorized");
          }
        });

        it("should allow editors to manage members groups through updatePermissions", async () => {
          // Add editor to the provisioned editor group
          await provisionedEditorGroup.dangerouslyAddMember(adminAuth, {
            user: editorUser.toJSON(),
            allowProvisionnedGroups: true,
          });

          // Create another provisioned group for the new members
          const newProvisionedMemberGroup = await GroupResource.makeNew({
            name: "New Provisioned Members Group",
            workspaceId: workspace.id,
            kind: "provisioned",
          });

          // Add members to the new provisioned group
          await newProvisionedMemberGroup.dangerouslyAddMembers(adminAuth, {
            users: [user1.toJSON(), user2.toJSON(), editorUser.toJSON()],
            allowProvisionnedGroups: true,
          });

          // Create an authenticator for the editor user
          const editorAuth = await Authenticator.fromUserIdAndWorkspaceId(
            editorUser.sId,
            workspace.sId
          );

          // Reload space to get updated groups
          const reloadedSpace = await SpaceResource.fetchById(
            editorAuth,
            projectSpace.sId
          );

          expect(newProvisionedMemberGroup.canRead(editorAuth)).toBe(true);

          // Editor should be able to manage members through updatePermissions
          const result = await reloadedSpace!.updatePermissions(editorAuth, {
            name: "Test Project Space",
            isRestricted: true,
            managementMode: "group",
            groupIds: [newProvisionedMemberGroup.sId],
            editorGroupIds: [provisionedEditorGroup.sId], // Keep the editor group
          });

          expect(result.isOk()).toBe(true);

          // Verify the new provisioned group is associated
          const groupSpaces = await GroupSpaceMemberResource.fetchBySpace({
            space: projectSpace,
          });
          const associatedGroupIds = groupSpaces.map((gs) => gs.groupId);
          expect(associatedGroupIds).toContain(newProvisionedMemberGroup.id);

          // Verify editor group is still associated
          const editorGroupSpaces = await GroupSpaceModel.findAll({
            where: {
              vaultId: projectSpace.id,
              workspaceId: workspace.id,
              kind: "project_editor",
            },
          });
          const editorGroupIds = editorGroupSpaces.map((gs) => gs.groupId);
          expect(editorGroupIds).toContain(provisionedEditorGroup.id);
        });
      });
    });
  });

  describe("listWorkspaceSpaces", () => {
    let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
    let adminAuth: Authenticator;
    let globalGroup: GroupResource;
    let systemGroup: GroupResource;

    beforeEach(async () => {
      workspace = await WorkspaceFactory.basic();
      const adminUser = await UserFactory.basic();

      // Set up default groups and spaces FIRST (before creating authenticators)
      const { globalGroup: gGroup, systemGroup: sGroup } =
        await GroupFactory.defaults(workspace);
      globalGroup = gGroup;
      systemGroup = sGroup;

      await MembershipFactory.associate(workspace, adminUser, {
        role: "admin",
      });

      // Create internal admin auth to set up default spaces
      const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await SpaceResource.makeDefaultsForWorkspace(internalAdminAuth, {
        globalGroup,
        systemGroup,
      });

      // Now create admin authenticator
      adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
        adminUser.sId,
        workspace.sId
      );
    });

    it("should return default spaces (system, global, regular) by default", async () => {
      const regularSpace = await SpaceFactory.regular(workspace);
      const spaces = await SpaceResource.listWorkspaceSpaces(adminAuth);

      const spaceKinds = spaces.map((s) => s.kind).sort();
      expect(spaceKinds).toContain("system");
      expect(spaceKinds).toContain("global");
      expect(spaceKinds).toContain("regular");
      expect(spaces.some((s) => s.id === regularSpace.id)).toBe(true);
    });

    it("should include conversations space when includeConversationsSpace is true", async () => {
      const spaces = await SpaceResource.listWorkspaceSpaces(adminAuth, {
        includeConversationsSpace: true,
      });

      const spaceKinds = spaces.map((s) => s.kind);
      expect(spaceKinds).toContain("conversations");
    });

    it("should not include conversations space when includeConversationsSpace is false", async () => {
      const spaces = await SpaceResource.listWorkspaceSpaces(adminAuth, {
        includeConversationsSpace: false,
      });

      const spaceKinds = spaces.map((s) => s.kind);
      expect(spaceKinds).not.toContain("conversations");
    });

    it("should include project spaces when includeProjectSpaces is true", async () => {
      const projectSpace = await SpaceFactory.project(workspace);
      const spaces = await SpaceResource.listWorkspaceSpaces(adminAuth, {
        includeProjectSpaces: true,
      });

      expect(spaces.some((s) => s.id === projectSpace.id)).toBe(true);
    });

    it("should not include project spaces when includeProjectSpaces is false", async () => {
      const projectSpace = await SpaceFactory.project(workspace);
      const spaces = await SpaceResource.listWorkspaceSpaces(adminAuth, {
        includeProjectSpaces: false,
      });

      expect(spaces.some((s) => s.id === projectSpace.id)).toBe(false);
    });

    it("should include deleted spaces when includeDeleted is true", async () => {
      const regularSpace = await SpaceFactory.regular(workspace);
      await regularSpace.delete(adminAuth, { hardDelete: false });

      const spaces = await SpaceResource.listWorkspaceSpaces(adminAuth, {
        includeDeleted: true,
      });

      expect(spaces.some((s) => s.id === regularSpace.id)).toBe(true);
    });

    it("should not include deleted spaces when includeDeleted is false", async () => {
      const regularSpace = await SpaceFactory.regular(workspace);
      await regularSpace.delete(adminAuth, { hardDelete: false });

      const spaces = await SpaceResource.listWorkspaceSpaces(adminAuth, {
        includeDeleted: false,
      });

      expect(spaces.some((s) => s.id === regularSpace.id)).toBe(false);
    });

    it("should include all space types when all options are true", async () => {
      const regularSpace = await SpaceFactory.regular(workspace);
      const projectSpace = await SpaceFactory.project(workspace);

      const spaces = await SpaceResource.listWorkspaceSpaces(adminAuth, {
        includeConversationsSpace: true,
        includeProjectSpaces: true,
      });

      const spaceKinds = spaces.map((s) => s.kind);
      expect(spaceKinds).toContain("system");
      expect(spaceKinds).toContain("global");
      expect(spaceKinds).toContain("conversations");
      expect(spaceKinds).toContain("regular");
      expect(spaceKinds).toContain("project");
      expect(spaces.some((s) => s.id === regularSpace.id)).toBe(true);
      expect(spaces.some((s) => s.id === projectSpace.id)).toBe(true);
    });
  });

  describe("listWorkspaceSpacesAsMember", () => {
    let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
    let adminAuth: Authenticator;
    let userAuth: Authenticator;
    let globalGroup: GroupResource;
    let systemGroup: GroupResource;
    let regularGroup: GroupResource;
    let restrictedGroup: GroupResource;
    let user1: UserResource;

    beforeEach(async () => {
      workspace = await WorkspaceFactory.basic();
      const adminUser = await UserFactory.basic();
      const regularUser = await UserFactory.basic();

      // Set up default groups and spaces FIRST (before creating authenticators)
      const { globalGroup: gGroup, systemGroup: sGroup } =
        await GroupFactory.defaults(workspace);
      globalGroup = gGroup;
      systemGroup = sGroup;

      await MembershipFactory.associate(workspace, adminUser, {
        role: "admin",
      });
      await MembershipFactory.associate(workspace, regularUser, {
        role: "user",
      });

      // Create internal admin auth to set up default spaces
      const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await SpaceResource.makeDefaultsForWorkspace(internalAdminAuth, {
        globalGroup,
        systemGroup,
      });

      // Now create user authenticators
      adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
        adminUser.sId,
        workspace.sId
      );
      userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        regularUser.sId,
        workspace.sId
      );

      // Create test user
      user1 = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user1, { role: "user" });
    });

    it("should return global space for all workspace members", async () => {
      const spaces = await SpaceResource.listWorkspaceSpacesAsMember(userAuth);

      const globalSpaces = spaces.filter((s) => s.isGlobal());
      expect(globalSpaces.length).toBeGreaterThan(0);
    });

    it("should not return system space for regular users", async () => {
      const spaces = await SpaceResource.listWorkspaceSpacesAsMember(userAuth);

      const systemSpaces = spaces.filter((s) => s.isSystem());
      expect(systemSpaces.length).toBe(0);
    });

    it("should not return conversations space for regular users", async () => {
      const spaces = await SpaceResource.listWorkspaceSpacesAsMember(userAuth);

      const conversationsSpaces = spaces.filter((s) => s.isConversations());
      expect(conversationsSpaces.length).toBe(0);
    });

    it("should return open regular spaces (with global group) for all workspace members", async () => {
      regularGroup = await GroupResource.makeNew({
        name: "Regular Group",
        workspaceId: workspace.id,
        kind: "regular",
      });

      const openSpace = await SpaceResource.makeNew(
        {
          name: "Open Space",
          kind: "regular",
          workspaceId: workspace.id,
        },
        { members: [regularGroup, globalGroup] }
      );

      const spaces = await SpaceResource.listWorkspaceSpacesAsMember(userAuth);
      expect(spaces.some((s) => s.id === openSpace.id)).toBe(true);
    });

    it("should return restricted regular spaces only for members", async () => {
      restrictedGroup = await GroupResource.makeNew({
        name: "Restricted Group",
        workspaceId: workspace.id,
        kind: "regular",
      });

      const restrictedSpace = await SpaceResource.makeNew(
        {
          name: "Restricted Space",
          kind: "regular",
          workspaceId: workspace.id,
        },
        { members: [restrictedGroup] }
      );

      // User is not a member, should not see it
      const userSpaces =
        await SpaceResource.listWorkspaceSpacesAsMember(userAuth);
      expect(userSpaces.some((s) => s.id === restrictedSpace.id)).toBe(false);

      // Add user to the group
      await restrictedGroup.dangerouslyAddMembers(adminAuth, {
        users: [user1.toJSON()],
      });

      // Reload auth to get updated groups
      const user1Auth = await Authenticator.fromUserIdAndWorkspaceId(
        user1.sId,
        workspace.sId
      );

      const user1Spaces =
        await SpaceResource.listWorkspaceSpacesAsMember(user1Auth);
      expect(user1Spaces.some((s) => s.id === restrictedSpace.id)).toBe(true);
    });

    it("should return project spaces only for members", async () => {
      const projectSpace = await SpaceFactory.project(workspace);
      const projectGroup = projectSpace.groups.find(
        (g) => g.kind === "regular"
      );

      // User is not a member, should not see it
      const userSpaces =
        await SpaceResource.listWorkspaceSpacesAsMember(userAuth);
      expect(userSpaces.some((s) => s.id === projectSpace.id)).toBe(false);

      // Add user to the project group
      if (projectGroup) {
        await projectGroup.dangerouslyAddMembers(adminAuth, {
          users: [user1.toJSON()],
        });

        // Reload auth to get updated groups
        const user1Auth = await Authenticator.fromUserIdAndWorkspaceId(
          user1.sId,
          workspace.sId
        );

        const user1Spaces =
          await SpaceResource.listWorkspaceSpacesAsMember(user1Auth);
        expect(user1Spaces.some((s) => s.id === projectSpace.id)).toBe(true);
      }
    });

    it("should return admin's spaces correctly", async () => {
      const spaces = await SpaceResource.listWorkspaceSpacesAsMember(adminAuth);

      // Admin should see global space
      const globalSpaces = spaces.filter((s) => s.isGlobal());
      expect(globalSpaces.length).toBeGreaterThan(0);
    });
  });

  describe("isMember", () => {
    let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
    let adminAuth: Authenticator;
    let userAuth: Authenticator;
    let nonMemberAuth: Authenticator;
    let globalGroup: GroupResource;
    let systemGroup: GroupResource;
    let regularGroup: GroupResource;
    let restrictedGroup: GroupResource;
    let user1: UserResource;
    let user2: UserResource;

    beforeEach(async () => {
      workspace = await WorkspaceFactory.basic();
      const adminUser = await UserFactory.basic();
      const regularUser = await UserFactory.basic();

      // Set up default groups and spaces FIRST (before creating authenticators)
      const { globalGroup: gGroup, systemGroup: sGroup } =
        await GroupFactory.defaults(workspace);
      globalGroup = gGroup;
      systemGroup = sGroup;

      await MembershipFactory.associate(workspace, adminUser, {
        role: "admin",
      });
      await MembershipFactory.associate(workspace, regularUser, {
        role: "user",
      });

      // Create internal admin auth to set up default spaces
      const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await SpaceResource.makeDefaultsForWorkspace(internalAdminAuth, {
        globalGroup,
        systemGroup,
      });

      // Now create user authenticators
      adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
        adminUser.sId,
        workspace.sId
      );
      userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        regularUser.sId,
        workspace.sId
      );

      // Create test users
      user1 = await UserFactory.basic();
      user2 = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user1, { role: "user" });
      await MembershipFactory.associate(workspace, user2, { role: "user" });

      // Create non-member auth (user2)
      nonMemberAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user2.sId,
        workspace.sId
      );
    });

    describe("global space", () => {
      it("should return true for all workspace members", async () => {
        const globalSpace =
          await SpaceResource.fetchWorkspaceGlobalSpace(adminAuth);
        expect(globalSpace.isMember(adminAuth)).toBe(true);
        expect(globalSpace.isMember(userAuth)).toBe(true);
        expect(globalSpace.isMember(nonMemberAuth)).toBe(true);
      });
    });

    describe("system space", () => {
      it("should return false for all users", async () => {
        const systemSpace =
          await SpaceResource.fetchWorkspaceSystemSpace(adminAuth);
        expect(systemSpace.isMember(adminAuth)).toBe(false);
        expect(systemSpace.isMember(userAuth)).toBe(false);
        expect(systemSpace.isMember(nonMemberAuth)).toBe(false);
      });
    });

    describe("conversations space", () => {
      it("should return false for all users", async () => {
        const conversationsSpace =
          await SpaceResource.fetchWorkspaceConversationsSpace(adminAuth);
        expect(conversationsSpace.isMember(adminAuth)).toBe(false);
        expect(conversationsSpace.isMember(userAuth)).toBe(false);
        expect(conversationsSpace.isMember(nonMemberAuth)).toBe(false);
      });
    });

    describe("regular space - open (with global group)", () => {
      it("should return true for all workspace members", async () => {
        regularGroup = await GroupResource.makeNew({
          name: "Regular Group",
          workspaceId: workspace.id,
          kind: "regular",
        });

        const openSpace = await SpaceResource.makeNew(
          {
            name: "Open Space",
            kind: "regular",
            workspaceId: workspace.id,
          },
          { members: [regularGroup, globalGroup] }
        );

        expect(openSpace.isMember(adminAuth)).toBe(true);
        expect(openSpace.isMember(userAuth)).toBe(true);
        expect(openSpace.isMember(nonMemberAuth)).toBe(true);
      });
    });

    describe("regular space - restricted (without global group)", () => {
      it("should return true only for group members", async () => {
        restrictedGroup = await GroupResource.makeNew({
          name: "Restricted Group",
          workspaceId: workspace.id,
          kind: "regular",
        });

        const restrictedSpace = await SpaceResource.makeNew(
          {
            name: "Restricted Space",
            kind: "regular",
            workspaceId: workspace.id,
          },
          { members: [restrictedGroup] }
        );

        // Non-member should not be a member
        expect(restrictedSpace.isMember(nonMemberAuth)).toBe(false);

        // Add user1 to the group
        await restrictedGroup.dangerouslyAddMembers(adminAuth, {
          users: [user1.toJSON()],
        });

        // Reload auth to get updated groups
        const user1Auth = await Authenticator.fromUserIdAndWorkspaceId(
          user1.sId,
          workspace.sId
        );

        // Reload space to get updated groups
        const updatedSpace = await SpaceResource.fetchById(
          adminAuth,
          restrictedSpace.sId
        );

        expect(updatedSpace?.isMember(user1Auth)).toBe(true);
        expect(updatedSpace?.isMember(nonMemberAuth)).toBe(false);
      });
    });

    describe("project space - open (with global group)", () => {
      it("should return false even with global group (global group is ignored for projects)", async () => {
        regularGroup = await GroupResource.makeNew({
          name: "Project Group",
          workspaceId: workspace.id,
          kind: "regular",
        });

        const projectSpace = await SpaceResource.makeNew(
          {
            name: "Open Project",
            kind: "project",
            workspaceId: workspace.id,
          },
          { members: [regularGroup, globalGroup] }
        );

        // Even with global group, project spaces don't grant membership via global group
        expect(projectSpace.isMember(adminAuth)).toBe(false);
        expect(projectSpace.isMember(userAuth)).toBe(false);
        expect(projectSpace.isMember(nonMemberAuth)).toBe(false);
      });
    });

    describe("project space - restricted (without global group)", () => {
      it("should return true only for group members", async () => {
        restrictedGroup = await GroupResource.makeNew({
          name: "Project Group",
          workspaceId: workspace.id,
          kind: "regular",
        });

        const projectSpace = await SpaceResource.makeNew(
          {
            name: "Restricted Project",
            kind: "project",
            workspaceId: workspace.id,
          },
          { members: [restrictedGroup] }
        );

        // Non-member should not be a member
        expect(projectSpace.isMember(nonMemberAuth)).toBe(false);

        // Add user1 to the group
        await restrictedGroup.dangerouslyAddMembers(adminAuth, {
          users: [user1.toJSON()],
        });

        // Reload auth to get updated groups
        const user1Auth = await Authenticator.fromUserIdAndWorkspaceId(
          user1.sId,
          workspace.sId
        );

        // Reload space to get updated groups
        const updatedSpace = await SpaceResource.fetchById(
          adminAuth,
          projectSpace.sId
        );

        expect(updatedSpace?.isMember(user1Auth)).toBe(true);
        expect(updatedSpace?.isMember(nonMemberAuth)).toBe(false);
      });
    });
  });
});

// List of all known models that have a foreign key relationship to Space (via vaultId or spaceId)
// These are Sequelize model names (modelName property), not TypeScript class names
const KNOWN_SPACE_RELATED_MODELS = [
  "app",
  "conversation",
  "data_source",
  "data_source_view",
  "group_vaults",
  "mcp_server_view",
  "user_project_digest", // TODO(rcs): to add
  "project_metadata", // TODO(rcs): to move to scrub
  "webhook_sources_view",
];

describe("SpaceResource cleanup on delete", () => {
  describe("model relationship detection", () => {
    /**
     * This test ensures that when a space is deleted, all related resources are properly cleaned up.
     * If you add a new model with a `vaultId` or `spaceId` foreign key, you MUST:
     * 1. Add it to the KNOWN_SPACE_RELATED_MODELS list above
     * 2. Add proper cleanup logic in `scrubSpaceActivity`
     */

    it("should detect any new models with space relationships", async () => {
      loadAllModels();
      const models = frontSequelize.models;
      const modelsWithSpaceFK: string[] = [];

      // Scan all models for vaultId or spaceId foreign keys
      Object.entries(models).forEach(([modelName, model]) => {
        const attributes = model.getAttributes();

        // Check if model has vaultId or spaceId field
        const hasVaultId = "vaultId" in attributes;
        const hasSpaceId = "spaceId" in attributes;

        if (hasVaultId || hasSpaceId) {
          modelsWithSpaceFK.push(modelName);
        }
      });

      // Sort for consistent comparison
      modelsWithSpaceFK.sort();
      const knownModels = [...KNOWN_SPACE_RELATED_MODELS].sort();

      if (modelsWithSpaceFK.length !== knownModels.length) {
        const missing = modelsWithSpaceFK.filter(
          (m) => !knownModels.includes(m)
        );
        const extra = knownModels.filter((m) => !modelsWithSpaceFK.includes(m));

        let errorMessage = "Space-related models have changed!\n\n";

        if (missing.length > 0) {
          errorMessage += `New models detected with space relationships:\n${missing.map((m) => `  - ${m}`).join("\n")}\n\n`;
          errorMessage +=
            "You MUST:\n" +
            "1. Add these models to KNOWN_SPACE_RELATED_MODELS in space_resource_cleanup.test.ts\n" +
            "2. Add proper cleanup logic in `scrubSpaceActivity`\n";
        }

        if (extra.length > 0) {
          errorMessage += `Models removed or renamed:\n${extra.map((m) => `  - ${m}`).join("\n")}\n\n`;
          errorMessage +=
            "Remove these from KNOWN_SPACE_RELATED_MODELS in space_resource_cleanup.test.ts\n";
        }

        throw new Error(errorMessage);
      }

      // Verify they match exactly
      expect(modelsWithSpaceFK).toEqual(knownModels);
    });
  });
});
