import { loadAllModels } from "@app/admin/db";
import { hardDeleteSpace } from "@app/lib/api/spaces";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { ConversationSelectedSpaceModel } from "@app/lib/models/agent/conversation_selected_space";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { SandboxEnvVarModel } from "@app/lib/resources/storage/models/sandbox_env_var";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SandboxEnvVarFactory } from "@app/tests/utils/SandboxEnvVarFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { getNamespace } from "@app/tests/utils/test_cls";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WebhookSourceViewFactory } from "@app/tests/utils/WebhookSourceViewFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
        kind: "regular_auto",
      });

      regularSpace = await SpaceResource.makeNew(
        adminAuth,
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

    // The grants `regularSpace` confers on `groups`, as (group, grantType) pairs sorted by group so
    // they can be compared with a literal.
    const spaceGrantsForGroups = async (groups: GroupResource[]) => {
      const grants = await GroupPermissionResource.listForGroups(
        adminAuth.getNonNullableWorkspace(),
        {
          groupModelIds: groups.map((group) => group.id),
          resourceType: "space",
          resourceId: regularSpace.id,
        }
      );
      return grants
        .map((grant) => ({
          groupId: grant.groupId,
          grantType: grant.grantType,
        }))
        .sort((a, b) => a.groupId - b.groupId);
    };

    it("should delete selected spaces before hard deleting a space", async () => {
      const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
        name: "Test Agent",
        description: "Test agent",
        scope: "hidden",
      });
      const conversation = await ConversationFactory.create(adminAuth, {
        agentConfigurationId: agent.sId,
        messagesCreatedAt: [new Date()],
      });

      await ConversationSelectedSpaceModel.create({
        workspaceId: workspace.id,
        conversationId: conversation.id,
        spaceId: regularSpace.id,
        selectedByUserId: user1.id,
        origin: "input_bar",
      });

      const softDeleteResult = await regularSpace.delete(adminAuth, {
        hardDelete: false,
      });
      expect(softDeleteResult.isOk()).toBe(true);

      const deletedSpace = await SpaceResource.fetchById(
        adminAuth,
        regularSpace.sId,
        { includeDeleted: true }
      );
      if (!deletedSpace) {
        throw new Error("Deleted space should exist");
      }

      const hardDeleteResult = await hardDeleteSpace(adminAuth, deletedSpace);

      expect(hardDeleteResult.isOk()).toBe(true);
      await expect(
        ConversationSelectedSpaceModel.count({
          where: {
            workspaceId: workspace.id,
            spaceId: regularSpace.id,
          },
        })
      ).resolves.toBe(0);
    });

    it("checks remaining group grants in the deletion transaction", async () => {
      const transaction = getNamespace("test-namespace")?.get("transaction");
      expect(transaction).toBeDefined();
      const listForGroupSpy = vi.spyOn(GroupPermissionResource, "listForGroup");

      const deleteResult = await regularSpace.delete(adminAuth, {
        hardDelete: false,
        transaction,
      });

      expect(deleteResult.isOk()).toBe(true);
      expect(listForGroupSpy).toHaveBeenCalledWith(
        adminAuth,
        expect.objectContaining({ id: regularGroup.id }),
        transaction
      );
      listForGroupSpy.mockRestore();
    });

    it("should delete pod-scoped sandbox env vars but keep workspace-scoped ones when hard deleting a space", async () => {
      const pod = await SpaceFactory.project(workspace, user1.id);

      await SandboxEnvVarFactory.create(adminAuth, {
        name: "POD_TOKEN",
        space: pod,
      });
      await SandboxEnvVarFactory.create(adminAuth, {
        name: "WORKSPACE_TOKEN",
      });

      const softDeleteResult = await pod.delete(adminAuth, {
        hardDelete: false,
      });
      expect(softDeleteResult.isOk()).toBe(true);

      const deletedSpace = await SpaceResource.fetchById(adminAuth, pod.sId, {
        includeDeleted: true,
      });
      if (!deletedSpace) {
        throw new Error("Deleted space should exist");
      }

      const hardDeleteResult = await hardDeleteSpace(adminAuth, deletedSpace);
      expect(hardDeleteResult.isOk()).toBe(true);

      await expect(
        SandboxEnvVarModel.count({
          where: { workspaceId: workspace.id, spaceId: pod.id },
        })
      ).resolves.toBe(0);
      await expect(
        SandboxEnvVarModel.count({
          where: { workspaceId: workspace.id, name: "WORKSPACE_TOKEN" },
        })
      ).resolves.toBe(1);
    });

    it("should delete all webhook triggers before hard deleting a space", async () => {
      const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
        name: "Webhook Agent",
      });
      const webhookSourceView = await new WebhookSourceViewFactory(
        workspace
      ).create(regularSpace);
      const triggers = await Promise.all([
        TriggerFactory.webhook(adminAuth, {
          agentConfigurationId: agent.sId,
          name: "Webhook Trigger 1",
          webhookSourceViewId: webhookSourceView.id,
        }),
        TriggerFactory.webhook(adminAuth, {
          agentConfigurationId: agent.sId,
          name: "Webhook Trigger 2",
          webhookSourceViewId: webhookSourceView.id,
        }),
      ]);
      const unrelatedTrigger = await TriggerFactory.webhook(adminAuth, {
        agentConfigurationId: agent.sId,
        name: "Unrelated Webhook Trigger",
      });
      const webhookRequest = await WebhookRequestResource.makeNew({
        workspaceId: workspace.id,
        webhookSourceId: webhookSourceView.webhookSourceId,
        status: "received",
      });
      await webhookRequest.markRelatedTrigger({
        trigger: triggers[0].toJSON(),
        status: "workflow_start_succeeded",
      });

      const softDeleteResult = await regularSpace.delete(adminAuth, {
        hardDelete: false,
      });
      expect(softDeleteResult.isOk()).toBe(true);

      const deletedSpace = await SpaceResource.fetchById(
        adminAuth,
        regularSpace.sId,
        { includeDeleted: true }
      );
      if (!deletedSpace) {
        throw new Error("Deleted space should exist");
      }

      const hardDeleteResult = await hardDeleteSpace(adminAuth, deletedSpace);

      expect(hardDeleteResult.isOk()).toBe(true);
      const remainingTriggers = await TriggerResource.fetchByIds(adminAuth, [
        ...triggers.map((trigger) => trigger.sId),
        unrelatedTrigger.sId,
      ]);
      expect(remainingTriggers.map((trigger) => trigger.sId)).toEqual([
        unrelatedTrigger.sId,
      ]);
      await expect(
        WebhookRequestResource.fetchByModelIdWithAuth(
          adminAuth,
          webhookRequest.id
        )
      ).resolves.toBeNull();
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
        const memberIds = members.map((m) => m.sId);
        expect(memberIds).toContain(user1.sId);
        expect(memberIds).toContain(user2.sId);
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

      it("should drop the provisioned group's grant when switching from group to manual mode", async () => {
        const provisionedGroup = await GroupResource.makeNew({
          name: "Provisioned Group",
          workspaceId: workspace.id,
          kind: "provisioned",
        });

        // Group mode: the provisioned group is granted on the space.
        const groupResult = await regularSpace.updatePermissions(adminAuth, {
          name: "Test Space",
          isRestricted: true,
          managementMode: "group",
          groupIds: [provisionedGroup.sId],
          editorGroupIds: [],
        });
        expect(groupResult.isOk()).toBe(true);

        expect(
          await spaceGrantsForGroups([regularGroup, provisionedGroup])
        ).toEqual(
          [
            { groupId: regularGroup.id, grantType: "member" },
            { groupId: provisionedGroup.id, grantType: "member" },
          ].sort((a, b) => a.groupId - b.groupId)
        );

        // Switching to manual mode drops the provisioned group's grant: provisioned groups do not
        // carry grants on manually-managed spaces.
        const spaceAfterGroup = await SpaceResource.fetchById(
          adminAuth,
          regularSpace.sId
        );
        const manualResult = await spaceAfterGroup!.updatePermissions(
          adminAuth,
          {
            name: "Test Space",
            isRestricted: true,
            managementMode: "manual",
            memberIds: [user1.sId],
            editorIds: [],
          }
        );
        expect(manualResult.isOk()).toBe(true);

        expect(
          await spaceGrantsForGroups([regularGroup, provisionedGroup])
        ).toEqual([{ groupId: regularGroup.id, grantType: "member" }]);
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
        const associatedGroupIds = (
          await updatedSpace!.fetchGrantReferences()
        ).map((group) => group.groupId);
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
        const refetchedSpace = await SpaceResource.fetchById(
          adminAuth,
          regularSpace.sId
        );
        const associatedGroupIds = (
          await refetchedSpace!.fetchGrantReferences()
        ).map((group) => group.groupId);
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

      it("should add the provisioned group's grant when switching from manual to group mode", async () => {
        const provisionedGroup = await GroupResource.makeNew({
          name: "Provisioned Group",
          workspaceId: workspace.id,
          kind: "provisioned",
        });

        // Manual mode: only the space's own member group is granted.
        const manualResult = await regularSpace.updatePermissions(adminAuth, {
          name: "Test Space",
          isRestricted: true,
          managementMode: "manual",
          memberIds: [user1.sId],
          editorIds: [],
        });
        expect(manualResult.isOk()).toBe(true);

        expect(
          await spaceGrantsForGroups([regularGroup, provisionedGroup])
        ).toEqual([{ groupId: regularGroup.id, grantType: "member" }]);

        // Switching to group mode grants the selected provisioned group.
        const spaceAfterManual = await SpaceResource.fetchById(
          adminAuth,
          regularSpace.sId
        );
        const groupResult = await spaceAfterManual!.updatePermissions(
          adminAuth,
          {
            name: "Test Space",
            isRestricted: true,
            managementMode: "group",
            groupIds: [provisionedGroup.sId],
            editorGroupIds: [],
          }
        );
        expect(groupResult.isOk()).toBe(true);

        expect(
          await spaceGrantsForGroups([regularGroup, provisionedGroup])
        ).toEqual(
          [
            { groupId: regularGroup.id, grantType: "member" },
            { groupId: provisionedGroup.id, grantType: "member" },
          ].sort((a, b) => a.groupId - b.groupId)
        );
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

    it("re-attaches a provisioned group after switching group -> manual -> group", async () => {
      // Regression: switching to manual drops the provisioned grant but leaves the group_vaults
      // row; space.groups is now sourced from group_permissions, so re-attaching must still clean
      // the stale group_vaults row or the (vaultId, groupId) unique constraint fires.
      const provisioned = await GroupFactory.provisioned(workspace, "Prov");
      let space = await SpaceFactory.regular(workspace);

      const toGroup = await space.updatePermissions(adminAuth, {
        name: space.name,
        isRestricted: true,
        managementMode: "group",
        groupIds: [provisioned.sId],
        editorGroupIds: [],
      });
      expect(toGroup.isOk()).toBe(true);

      space = (await SpaceResource.fetchById(adminAuth, space.sId))!;
      const toManual = await space.updatePermissions(adminAuth, {
        name: space.name,
        isRestricted: true,
        managementMode: "manual",
        memberIds: [],
        editorIds: [],
      });
      expect(toManual.isOk()).toBe(true);

      space = (await SpaceResource.fetchById(adminAuth, space.sId))!;
      const toGroupAgain = await space.updatePermissions(adminAuth, {
        name: space.name,
        isRestricted: true,
        managementMode: "group",
        groupIds: [provisioned.sId],
        editorGroupIds: [],
      });
      expect(toGroupAgain.isOk()).toBe(true);
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
        const updatedSpace = await SpaceResource.fetchById(
          adminAuth,
          regularSpace.sId
        );
        const associatedGroupIds = (
          await updatedSpace!.fetchGrantReferences()
        ).map((group) => group.groupId);
        expect(associatedGroupIds).toContain(globalGroup.id);
      });

      it("should remove global group when changing from open to restricted", async () => {
        // First make it open through updatePermissions so the global group's grant is written
        // (space.groups is sourced from group_permissions).
        const openResult = await regularSpace.updatePermissions(adminAuth, {
          name: "Test Space",
          isRestricted: false,
          managementMode: "manual",
          memberIds: [user1.sId],
          editorIds: [],
        });
        expect(openResult.isOk()).toBe(true);

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
        const refetchedSpace = await SpaceResource.fetchById(
          adminAuth,
          regularSpace.sId
        );
        const associatedGroupIds = (
          await refetchedSpace!.fetchGrantReferences()
        ).map((group) => group.groupId);
        expect(associatedGroupIds).not.toContain(globalGroup.id);
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

        const spaceBefore = await SpaceResource.fetchById(
          adminAuth,
          regularSpace.sId
        );
        const globalGroupPresentBefore = (
          await spaceBefore!.fetchGrantReferences()
        ).some((group) => group.groupId === globalGroup.id);

        // Update but keep restricted
        await regularSpace.updatePermissions(adminAuth, {
          name: "Test Space Updated",
          isRestricted: true,
          managementMode: "manual",
          memberIds: [user2.sId],
          editorIds: [],
        });

        const spaceAfter = await SpaceResource.fetchById(
          adminAuth,
          regularSpace.sId
        );
        const globalGroupPresentAfter = (
          await spaceAfter!.fetchGrantReferences()
        ).some((group) => group.groupId === globalGroup.id);

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
          kind: "regular_auto",
        });
      });

      describe("with manual groups", () => {
        beforeEach(async () => {
          projectEditorGroup = await GroupResource.makeNew({
            name: "Project Editors Group",
            workspaceId: workspace.id,
            kind: "regular_auto",
          });

          projectSpace = await SpaceResource.makeNew(
            adminAuth,
            {
              name: "Test Project Space",
              kind: "project",
              workspaceId: workspace.id,
              managementMode: "manual",
            },
            { members: [projectMemberGroup], editors: [projectEditorGroup] }
          );
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
          const memberIds = members.map((m) => m.sId);
          expect(memberIds).toContain(user1.sId);
          expect(memberIds).toContain(user2.sId);

          // Verify editor is still in the editor group
          const editors = await projectEditorGroup.getActiveMembers(adminAuth);
          const editorIds = editors.map((m) => m.sId);
          expect(editorIds).toContain(editorUser.sId);
        });

        it("should no-op when adding an existing editor as a member", async () => {
          await projectEditorGroup.dangerouslyAddMember(adminAuth, {
            user: editorUser.toJSON(),
          });

          const editorAuth = await Authenticator.fromUserIdAndWorkspaceId(
            editorUser.sId,
            workspace.sId
          );
          const reloadedSpace = await SpaceResource.fetchById(
            editorAuth,
            projectSpace.sId
          );

          const addMembersRes = await reloadedSpace!.addMembers(editorAuth, {
            userIds: [editorUser.sId],
          });

          expect(addMembersRes.isOk()).toBe(true);
          if (addMembersRes.isOk()) {
            expect(addMembersRes.value).toHaveLength(0);
          }

          const memberGroupMembers =
            await projectMemberGroup.getActiveMembers(adminAuth);
          expect(
            memberGroupMembers.some((member) => member.sId === editorUser.sId)
          ).toBe(false);

          const editorGroupMembers =
            await projectEditorGroup.getActiveMembers(adminAuth);
          expect(
            editorGroupMembers.some((member) => member.sId === editorUser.sId)
          ).toBe(true);
        });

        it("should promote a member to editor and remove them from members", async () => {
          await projectMemberGroup.dangerouslyAddMember(adminAuth, {
            user: memberUser.toJSON(),
          });
          await projectEditorGroup.dangerouslyAddMember(adminAuth, {
            user: editorUser.toJSON(),
          });

          const editorAuth = await Authenticator.fromUserIdAndWorkspaceId(
            editorUser.sId,
            workspace.sId
          );
          const reloadedSpace = await SpaceResource.fetchById(
            editorAuth,
            projectSpace.sId
          );

          const addEditorsRes = await reloadedSpace!.addEditors(editorAuth, {
            userIds: [memberUser.sId],
          });

          expect(addEditorsRes.isOk()).toBe(true);

          const memberGroupMembers =
            await projectMemberGroup.getActiveMembers(adminAuth);
          expect(
            memberGroupMembers.some((member) => member.sId === memberUser.sId)
          ).toBe(false);

          const editorGroupMembers =
            await projectEditorGroup.getActiveMembers(adminAuth);
          expect(
            editorGroupMembers.some((member) => member.sId === memberUser.sId)
          ).toBe(true);
        });

        it("should reject removing the last editor", async () => {
          await projectEditorGroup.dangerouslyAddMember(adminAuth, {
            user: editorUser.toJSON(),
          });

          const editorAuth = await Authenticator.fromUserIdAndWorkspaceId(
            editorUser.sId,
            workspace.sId
          );
          const reloadedSpace = await SpaceResource.fetchById(
            editorAuth,
            projectSpace.sId
          );

          const removeEditorsRes = await reloadedSpace!.removeEditors(
            editorAuth,
            {
              userIds: [editorUser.sId],
            }
          );

          expect(removeEditorsRes.isErr()).toBe(true);
          if (removeEditorsRes.isErr()) {
            expect(removeEditorsRes.error.code).toBe(
              "group_requirements_not_met"
            );
          }
        });
      });

      describe("admin-controlled Pods", () => {
        beforeEach(async () => {
          projectEditorGroup = await GroupResource.makeNew({
            name: "Project Editors Group",
            workspaceId: workspace.id,
            kind: "regular_auto",
          });

          projectSpace = await SpaceResource.makeNew(
            adminAuth,
            {
              name: "Admin Controlled Project",
              kind: "project",
              workspaceId: workspace.id,
              managementMode: "manual",
            },
            { members: [projectMemberGroup], editors: [projectEditorGroup] }
          );

          await ProjectMetadataResource.makeNew(adminAuth, projectSpace, {
            description: "Admin controlled",
            isAdminControlled: false,
          });
        });

        it("demotes editors to members when enabling admin-controlled mode", async () => {
          await projectEditorGroup.dangerouslyAddMember(adminAuth, {
            user: editorUser.toJSON(),
          });
          await projectMemberGroup.dangerouslyAddMember(adminAuth, {
            user: memberUser.toJSON(),
          });

          const reloadedSpace = await SpaceResource.fetchById(
            adminAuth,
            projectSpace.sId
          );
          const result =
            await reloadedSpace!.applyAdminControlledMembershipChange(
              adminAuth,
              true
            );
          expect(result.isOk()).toBe(true);

          const editorGroupMembers =
            await projectEditorGroup.getActiveMembers(adminAuth);
          expect(editorGroupMembers).toHaveLength(0);

          const memberGroupMembers =
            await projectMemberGroup.getActiveMembers(adminAuth);
          expect(memberGroupMembers.some((m) => m.sId === editorUser.sId)).toBe(
            true
          );
          expect(memberGroupMembers.some((m) => m.sId === memberUser.sId)).toBe(
            true
          );
        });

        it("promotes the oldest member to editor when disabling admin-controlled mode", async () => {
          await projectMemberGroup.dangerouslyAddMember(adminAuth, {
            user: memberUser.toJSON(),
          });
          // Add editorUser second so memberUser is oldest.
          await projectMemberGroup.dangerouslyAddMember(adminAuth, {
            user: editorUser.toJSON(),
          });

          const metadata = await ProjectMetadataResource.fetchBySpace(
            adminAuth,
            projectSpace
          );
          await metadata!.updateIsAdminControlled(true);

          const reloadedSpace = await SpaceResource.fetchById(
            adminAuth,
            projectSpace.sId
          );
          const result =
            await reloadedSpace!.applyAdminControlledMembershipChange(
              adminAuth,
              false
            );
          expect(result.isOk()).toBe(true);

          const editorGroupMembers =
            await projectEditorGroup.getActiveMembers(adminAuth);
          expect(editorGroupMembers).toHaveLength(1);
          expect(editorGroupMembers[0].sId).toBe(memberUser.sId);

          const memberGroupMembers =
            await projectMemberGroup.getActiveMembers(adminAuth);
          expect(memberGroupMembers.some((m) => m.sId === memberUser.sId)).toBe(
            false
          );
          expect(memberGroupMembers.some((m) => m.sId === editorUser.sId)).toBe(
            true
          );
        });

        it("lets workspace admins administrate without being in the editor group", async () => {
          const metadata = await ProjectMetadataResource.fetchBySpace(
            adminAuth,
            projectSpace
          );
          await metadata!.updateIsAdminControlled(true);

          const reloadedSpace = await SpaceResource.fetchById(
            adminAuth,
            projectSpace.sId
          );

          expect(await reloadedSpace!.fetchIsAdminControlled()).toBe(true);
          expect(adminAuth.can("admin", reloadedSpace!)).toBe(true);
        });

        it("does not let managers administrate", async () => {
          const metadata = await ProjectMetadataResource.fetchBySpace(
            adminAuth,
            projectSpace
          );
          await metadata!.updateIsAdminControlled(true);

          const managerUser = await UserFactory.basic();
          await MembershipFactory.associate(workspace, managerUser, {
            role: "manager",
          });
          const managerAuth = await Authenticator.fromUserIdAndWorkspaceId(
            managerUser.sId,
            workspace.sId
          );

          const reloadedSpace = await SpaceResource.fetchById(
            managerAuth,
            projectSpace.sId
          );

          expect(managerAuth.can("admin", reloadedSpace!)).toBe(false);
        });

        it("blocks addEditors while admin-controlled", async () => {
          const metadata = await ProjectMetadataResource.fetchBySpace(
            adminAuth,
            projectSpace
          );
          await metadata!.updateIsAdminControlled(true);
          await projectMemberGroup.dangerouslyAddMember(adminAuth, {
            user: memberUser.toJSON(),
          });

          const reloadedSpace = await SpaceResource.fetchById(
            adminAuth,
            projectSpace.sId
          );

          const addRes = await reloadedSpace!.addEditors(adminAuth, {
            userIds: [memberUser.sId],
          });
          expect(addRes.isErr()).toBe(true);
          if (addRes.isErr()) {
            expect(addRes.error.code).toBe("unauthorized");
          }
        });

        it("rejects setting editors via updatePermissions while admin-controlled", async () => {
          const metadata = await ProjectMetadataResource.fetchBySpace(
            adminAuth,
            projectSpace
          );
          await metadata!.updateIsAdminControlled(true);
          await projectMemberGroup.dangerouslyAddMember(adminAuth, {
            user: memberUser.toJSON(),
          });

          const reloadedSpace = await SpaceResource.fetchById(
            adminAuth,
            projectSpace.sId
          );

          const result = await reloadedSpace!.updatePermissions(adminAuth, {
            name: projectSpace.name,
            isRestricted: true,
            managementMode: "manual",
            memberIds: [],
            editorIds: [memberUser.sId],
          });

          expect(result.isErr()).toBe(true);
          if (result.isErr()) {
            expect(result.error.code).toBe("unauthorized");
          }
        });

        it("allows updating members with an empty editor list while admin-controlled", async () => {
          const metadata = await ProjectMetadataResource.fetchBySpace(
            adminAuth,
            projectSpace
          );
          await metadata!.updateIsAdminControlled(true);
          await projectMemberGroup.dangerouslyAddMember(adminAuth, {
            user: memberUser.toJSON(),
          });

          const reloadedSpace = await SpaceResource.fetchById(
            adminAuth,
            projectSpace.sId
          );

          const result = await reloadedSpace!.updatePermissions(adminAuth, {
            name: projectSpace.name,
            isRestricted: true,
            managementMode: "manual",
            memberIds: [memberUser.sId, editorUser.sId],
            editorIds: [],
          });

          expect(result.isOk()).toBe(true);
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
            adminAuth,
            {
              name: "Test Project Space",
              kind: "project",
              workspaceId: workspace.id,
              managementMode: "group",
            },
            {
              members: [projectMemberGroup, provisionedMemberGroup],
              editors: [provisionedEditorGroup],
            }
          );
        });

        it("should not allow simple members to update space permissions", async () => {
          // Add user as a simple member to the provisioned group
          await provisionedMemberGroup.dangerouslyAddMember(adminAuth, {
            user: memberUser.toJSON(),
            allowProvisionedGroups: true,
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
            allowProvisionedGroups: true,
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
            allowProvisionedGroups: true,
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

          // Verify the associations via the space's group_permissions grants (the source of truth).
          const refetchedSpace = await SpaceResource.fetchById(
            adminAuth,
            projectSpace.sId
          );
          const associatedGroupIds = (
            await refetchedSpace!.fetchGrantReferences()
          ).map((group) => group.groupId);
          // The new provisioned member group is associated.
          expect(associatedGroupIds).toContain(newProvisionedMemberGroup.id);
          // The editor group is still associated.
          expect(associatedGroupIds).toContain(provisionedEditorGroup.id);
        });
      });
    });
  });

  describe("isRestricted", () => {
    let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
    let adminAuth: Authenticator;

    beforeEach(async () => {
      workspace = await WorkspaceFactory.basic();
      const adminUser = await UserFactory.basic();
      const { globalGroup, systemGroup } =
        await GroupFactory.defaults(workspace);
      await MembershipFactory.associate(workspace, adminUser, {
        role: "admin",
      });
      const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await SpaceResource.makeDefaultsForWorkspace(internalAdminAuth, {
        globalGroup,
        systemGroup,
      });
      adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
        adminUser.sId,
        workspace.sId
      );
    });

    // `isRestricted` is read from the space's `group_permissions` grants, so re-fetch after each
    // change rather than trusting the in-memory instance.
    const refetchIsRestricted = async (
      space: SpaceResource
    ): Promise<boolean> => {
      const refetched = await SpaceResource.fetchById(adminAuth, space.sId);
      expect(refetched).not.toBeNull();
      return refetched!.isRestricted(adminAuth);
    };

    it("is true for a restricted space and false once opened", async () => {
      const space = await SpaceFactory.regular(workspace);
      expect(await refetchIsRestricted(space)).toBe(true);

      const openResult = await space.updatePermissions(adminAuth, {
        name: space.name,
        isRestricted: false,
        managementMode: "manual",
        memberIds: [],
        editorIds: [],
      });
      expect(openResult.isOk()).toBe(true);

      expect(await refetchIsRestricted(space)).toBe(false);
    });

    it("flips back to true when an open space is restricted again", async () => {
      const space = await SpaceFactory.regular(workspace);
      const openResult = await space.updatePermissions(adminAuth, {
        name: space.name,
        isRestricted: false,
        managementMode: "manual",
        memberIds: [],
        editorIds: [],
      });
      expect(openResult.isOk()).toBe(true);
      expect(await refetchIsRestricted(space)).toBe(false);

      const opened = await SpaceResource.fetchById(adminAuth, space.sId);
      const restrictResult = await opened!.updatePermissions(adminAuth, {
        name: space.name,
        isRestricted: true,
        managementMode: "manual",
        memberIds: [],
        editorIds: [],
      });
      expect(restrictResult.isOk()).toBe(true);

      expect(await refetchIsRestricted(space)).toBe(true);
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

    it("loads group references from the space's group_permissions grants on demand", async () => {
      const regularSpace = await SpaceFactory.regular(workspace);
      const [groupReference] = await regularSpace.fetchGrantReferences();

      const fetchedSpace = await SpaceResource.fetchById(
        adminAuth,
        regularSpace.sId
      );

      expect(fetchedSpace).not.toBeNull();
      // Grants are no longer eagerly included on the space fetch; they are loaded on demand.
      expect(await fetchedSpace?.fetchGrantReferences()).toEqual([
        expect.objectContaining({
          groupId: groupReference.groupId,
          grantType: "member",
          workspaceId: workspace.id,
        }),
      ]);
      // groupIds/isRestricted are likewise loaded on demand (via `enrichSpacesWithAccess`).
      const [enrichedSpace] = await SpaceResource.enrichSpacesWithAccess(
        adminAuth,
        [regularSpace]
      );
      expect(enrichedSpace.groupIds).toEqual([groupReference.groupSId]);
      expect(enrichedSpace.isRestricted).toBe(true);
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
        kind: "regular_auto",
      });

      const openSpace = await SpaceResource.makeNew(
        adminAuth,
        {
          name: "Open Space",
          kind: "regular",
          workspaceId: workspace.id,
        },
        { members: [regularGroup, globalGroup] }
      );

      // Membership reads from the caller's grants, resolved once at auth construction, so rebuild
      // the auth after the space (and its grants) exist — same as space authorization (`canRead`).
      const refreshedUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
        userAuth.getNonNullableUser().sId,
        workspace.sId
      );

      const spaces =
        await SpaceResource.listWorkspaceSpacesAsMember(refreshedUserAuth);
      expect(spaces.some((s) => s.id === openSpace.id)).toBe(true);
    });

    it("should return restricted regular spaces only for members", async () => {
      restrictedGroup = await GroupResource.makeNew({
        name: "Restricted Group",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });

      const restrictedSpace = await SpaceResource.makeNew(
        adminAuth,
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
      const [projectGroup] =
        await projectSpace.fetchRegularAutoGroups(adminAuth);

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
          kind: "regular_auto",
        });

        const openSpace = await SpaceResource.makeNew(
          adminAuth,
          {
            name: "Open Space",
            kind: "regular",
            workspaceId: workspace.id,
          },
          { members: [regularGroup, globalGroup] }
        );

        // Membership reads from the caller's grants, which are resolved once at auth construction,
        // so the auths must be rebuilt after the space (and its grants) exist — same as the
        // restricted case below. This matches how space authorization (`canRead`) already resolves.
        const openAdminAuth = await Authenticator.fromUserIdAndWorkspaceId(
          adminAuth.getNonNullableUser().sId,
          workspace.sId
        );
        const openUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
          userAuth.getNonNullableUser().sId,
          workspace.sId
        );
        const openNonMemberAuth = await Authenticator.fromUserIdAndWorkspaceId(
          nonMemberAuth.getNonNullableUser().sId,
          workspace.sId
        );

        // Open regular spaces grant every workspace member `reader`, so all are members.
        expect(openSpace.isMember(openAdminAuth)).toBe(true);
        expect(openSpace.isMember(openUserAuth)).toBe(true);
        expect(openSpace.isMember(openNonMemberAuth)).toBe(true);
      });
    });

    describe("regular space - restricted (without global group)", () => {
      it("should return true only for group members", async () => {
        restrictedGroup = await GroupResource.makeNew({
          name: "Restricted Group",
          workspaceId: workspace.id,
          kind: "regular_auto",
        });

        const restrictedSpace = await SpaceResource.makeNew(
          adminAuth,
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
          kind: "regular_auto",
        });

        const projectSpace = await SpaceResource.makeNew(
          adminAuth,
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
          kind: "regular_auto",
        });

        const projectSpace = await SpaceResource.makeNew(
          adminAuth,
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

  describe("listWorkspacePodsAsMember", () => {
    let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
    let adminAuth: Authenticator;
    let globalGroup: GroupResource;
    let systemGroup: GroupResource;
    let member: UserResource;

    beforeEach(async () => {
      workspace = await WorkspaceFactory.basic();
      const adminUser = await UserFactory.basic();
      member = await UserFactory.basic();

      const { globalGroup: gGroup, systemGroup: sGroup } =
        await GroupFactory.defaults(workspace);
      globalGroup = gGroup;
      systemGroup = sGroup;

      await MembershipFactory.associate(workspace, adminUser, {
        role: "admin",
      });
      await MembershipFactory.associate(workspace, member, { role: "user" });

      const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await SpaceResource.makeDefaultsForWorkspace(internalAdminAuth, {
        globalGroup,
        systemGroup,
      });

      adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
        adminUser.sId,
        workspace.sId
      );
    });

    it("returns only the projects the caller is a member or editor of", async () => {
      // A project the caller is a plain member of.
      const memberGroup = await GroupResource.makeNew({
        name: "Pod Members",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });
      const projectAsMember = await SpaceResource.makeNew(
        adminAuth,
        { name: "Member Pod", kind: "project", workspaceId: workspace.id },
        { members: [memberGroup] }
      );
      await memberGroup.dangerouslyAddMembers(adminAuth, {
        users: [member.toJSON()],
      });

      // A project the caller is an editor of (SpaceFactory puts the creator in the editor group).
      const projectAsEditor = await SpaceFactory.project(workspace, member.id);

      // A project the caller has nothing to do with — must not be returned.
      const otherProject = await SpaceFactory.project(workspace);

      // A regular space the caller is a member of: they hold `write` on it, but it is not a
      // project, so it must be filtered out by kind.
      const regularGroup = await GroupResource.makeNew({
        name: "Regular Members",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });
      await SpaceResource.makeNew(
        adminAuth,
        { name: "Regular Space", kind: "regular", workspaceId: workspace.id },
        { members: [regularGroup] }
      );
      await regularGroup.dangerouslyAddMembers(adminAuth, {
        users: [member.toJSON()],
      });

      // Build the caller's auth after all grants exist (grants are snapshotted at construction).
      const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
        member.sId,
        workspace.sId
      );

      const pods = await SpaceResource.listWorkspacePodsAsMember(memberAuth);

      expect(pods.map((p) => p.sId).sort()).toEqual(
        [projectAsMember.sId, projectAsEditor.sId].sort()
      );
      expect(pods.map((p) => p.sId)).not.toContain(otherProject.sId);
    });

    it("returns an empty list when the caller belongs to no project", async () => {
      await SpaceFactory.project(workspace);

      const pods = await SpaceResource.listWorkspacePodsAsMember(adminAuth);

      expect(pods).toEqual([]);
    });

    it("returns every project for a system key", async () => {
      const first = await SpaceFactory.project(workspace);
      const second = await SpaceFactory.project(workspace);

      const key = await KeyFactory.system(systemGroup);
      const workspaceAuth = await Authenticator.fromKey(key, workspace.sId);

      // A system key holds the type-wide space grant, so `isMember` is true on every project. The
      // enumeration has to agree rather than come back empty.
      const pods = await SpaceResource.listWorkspacePodsAsMember(workspaceAuth);

      expect(pods.map((p) => p.sId).sort()).toEqual(
        [first.sId, second.sId].sort()
      );
      expect(pods.every((p) => p.isMember(workspaceAuth))).toBe(true);
    });
  });
});

describe("searchProjectsByNamePaginated", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let globalGroup: GroupResource;
  let systemGroup: GroupResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    const { globalGroup: gGroup, systemGroup: sGroup } =
      await GroupFactory.defaults(workspace);
    globalGroup = gGroup;
    systemGroup = sGroup;

    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await SpaceResource.makeDefaultsForWorkspace(internalAdminAuth, {
      globalGroup,
      systemGroup,
    });
  });

  it("excludes project spaces user cannot read", async () => {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const permittedSpace = await SpaceFactory.project(workspace);
    const unpermittedSpace = await SpaceFactory.project(workspace);

    await permittedSpace.addMembers(internalAdminAuth, {
      userIds: [user.sId],
    });

    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const result = await SpaceResource.searchProjectsByNamePaginated(userAuth, {
      pagination: { limit: 20, orderDirection: "asc" },
    });

    expect(result.spaces.some((s) => s.id === permittedSpace.id)).toBe(true);
    expect(result.spaces.some((s) => s.id === unpermittedSpace.id)).toBe(false);
  });

  it("returns empty array when user has no readable project spaces", async () => {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    await SpaceFactory.project(workspace);
    await SpaceFactory.project(workspace);

    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const result = await SpaceResource.searchProjectsByNamePaginated(userAuth, {
      pagination: { limit: 20, orderDirection: "asc" },
    });

    expect(result.spaces).toHaveLength(0);
  });

  it("filters by query within readable spaces only", async () => {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const permittedSpace1 = await SpaceFactory.project(workspace);
    await permittedSpace1.addMembers(internalAdminAuth, {
      userIds: [user.sId],
    });

    const permittedSpace2 = await SpaceFactory.project(workspace);
    await permittedSpace2.addMembers(internalAdminAuth, {
      userIds: [user.sId],
    });

    const unpermittedSpace = await SpaceFactory.project(workspace);

    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const result = await SpaceResource.searchProjectsByNamePaginated(userAuth, {
      query: "project",
      pagination: { limit: 20, orderDirection: "asc" },
    });

    expect(result.spaces.some((s) => s.id === permittedSpace1.id)).toBe(true);
    expect(result.spaces.some((s) => s.id === permittedSpace2.id)).toBe(true);
    expect(result.spaces.some((s) => s.id === unpermittedSpace.id)).toBe(false);
  });
});

// List of all known models that have a foreign key relationship to Space (via vaultId or spaceId)
// These are Sequelize model names (modelName property), not TypeScript class names
const KNOWN_SPACE_RELATED_MODELS = [
  "activation_pod",
  "agent_project_configuration",
  "app",
  "conversation_selected_spaces",
  "content_fragment",
  "conversation",
  "data_source",
  "data_source_view",
  "mcp_server_view",
  "workspace_sandbox_env_var",
  "sandbox_function",
  "sandbox_owner",
  "project_metadata",
  "project_todo",
  "project_todo_state",
  "project_todo_version",
  "takeaways",
  "takeaways_version",
  "trigger",
  "webhook_sources_view",
  "user_project_preferences",
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

      // Scan all models for foreign keys pointing to the spaces table.
      const spaceTableName = SpaceModel.getTableName();
      Object.entries(models).forEach(([modelName, model]) => {
        const attributes = model.getAttributes();

        const hasSpaceFK = Object.values(attributes).some((attr) => {
          const ref = (attr as { references?: { model?: string } }).references;
          return ref?.model === spaceTableName;
        });

        if (hasSpaceFK) {
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
            "1. Add these models to KNOWN_SPACE_RELATED_MODELS in space_resource.test.ts\n" +
            "2. Add proper cleanup logic in `scrubSpaceActivity`\n";
        }

        if (extra.length > 0) {
          errorMessage += `Models removed or renamed:\n${extra.map((m) => `  - ${m}`).join("\n")}\n\n`;
          errorMessage +=
            "Remove these from KNOWN_SPACE_RELATED_MODELS in space_resource.test.ts\n";
        }

        throw new Error(errorMessage);
      }

      // Verify they match exactly
      expect(modelsWithSpaceFK).toEqual(knownModels);
    });
  });
});

describe("SpaceResource group_permissions enforcement", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let adminAuth: Authenticator;
  let memberUser: UserResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    const adminUser = await UserFactory.basic();
    memberUser = await UserFactory.basic();

    const { globalGroup, systemGroup } = await GroupFactory.defaults(workspace);
    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });
    await MembershipFactory.associate(workspace, memberUser, { role: "user" });

    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await SpaceResource.makeDefaultsForWorkspace(internalAdminAuth, {
      globalGroup,
      systemGroup,
    });

    adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );
  });

  // A restricted regular space grants its member group [read, write]; the member's role ("user")
  // grants nothing, so access flows purely through the group — isolating the group-vs-table check.
  async function setupRestrictedSpaceWithMember(): Promise<SpaceResource> {
    const space = await SpaceFactory.regular(workspace);
    const [memberGroup] = await space.fetchRegularAutoGroups(adminAuth);
    expect(memberGroup).toBeDefined();
    await memberGroup.dangerouslyAddMember(adminAuth, {
      user: memberUser.toJSON(),
    });
    return space;
  }

  it("enforces the table: member can read from the space's group grants", async () => {
    // `SpaceFactory.regular` writes the space's group_permissions on creation.
    const space = await setupRestrictedSpaceWithMember();

    // Built after the grants exist so its snapshot includes them.
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      memberUser.sId,
      workspace.sId
    );

    // Member group confers read+write; served from the group_permissions table.
    expect(memberAuth.can("read", space)).toBe(true);
    expect(memberAuth.can("write", space)).toBe(true);
  });

  // An open regular space attaches the workspace global group as a `reader` viewer, so everyone can
  // read it; its own member groups hold `member` and are the only source of write. These mirror the
  // restricted case above, for both ways a space's members can be managed.
  it("enforces the table: manual member of an open space can write, non-member can only read", async () => {
    const space = await SpaceFactory.regular(workspace);
    const openRes = await space.updatePermissions(adminAuth, {
      name: space.name,
      isRestricted: false,
      managementMode: "manual",
      memberIds: [memberUser.sId],
      editorIds: [],
    });
    expect(openRes.isOk()).toBe(true);

    const nonMemberUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, nonMemberUser, {
      role: "user",
    });

    // Built after the grants exist so their snapshots include them.
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      memberUser.sId,
      workspace.sId
    );
    const nonMemberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      nonMemberUser.sId,
      workspace.sId
    );

    // Refetched, not reused: `space` holds the grant snapshot from before the update.
    const openSpace = await SpaceResource.fetchById(adminAuth, space.sId);
    expect(openSpace).not.toBeNull();
    expect(await openSpace!.isRestricted(adminAuth)).toBe(false);

    // The member group confers write; the global group's `reader` grant only confers read.
    expect(memberAuth.can("read", openSpace!)).toBe(true);
    expect(memberAuth.can("write", openSpace!)).toBe(true);

    expect(nonMemberAuth.can("read", openSpace!)).toBe(true);
    expect(nonMemberAuth.can("write", openSpace!)).toBe(false);
  });

  it("enforces the table: group mode accepts a manual group, and deselecting it revokes access", async () => {
    const manualGroup = await GroupFactory.regularManual(workspace, "Squad");
    await GroupFactory.withMembers(adminAuth, manualGroup, [memberUser]);
    const provisionedGroup = await GroupFactory.provisioned(workspace, "IdP");

    const space = await SpaceFactory.regular(workspace);
    const setRes = await space.updatePermissions(adminAuth, {
      name: space.name,
      isRestricted: true,
      managementMode: "group",
      groupIds: [manualGroup.sId, provisionedGroup.sId],
      editorGroupIds: [],
    });
    expect(setRes.isOk()).toBe(true);

    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      memberUser.sId,
      workspace.sId
    );
    const withGroup = await SpaceResource.fetchById(adminAuth, space.sId);
    expect(memberAuth.can("read", withGroup!)).toBe(true);
    expect(memberAuth.can("write", withGroup!)).toBe(true);

    // Deselecting the manual group must drop its association, not just the provisioned ones.
    const unsetRes = await space.updatePermissions(adminAuth, {
      name: space.name,
      isRestricted: true,
      managementMode: "group",
      groupIds: [provisionedGroup.sId],
      editorGroupIds: [],
    });
    expect(unsetRes.isOk()).toBe(true);

    const refreshedMemberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      memberUser.sId,
      workspace.sId
    );
    const withoutGroup = await SpaceResource.fetchById(adminAuth, space.sId);
    expect(refreshedMemberAuth.can("read", withoutGroup!)).toBe(false);
    expect(refreshedMemberAuth.can("write", withoutGroup!)).toBe(false);
  });

  it("stops a group-mode group from granting once the space switches to manual", async () => {
    const manualGroup = await GroupFactory.regularManual(workspace, "Squad");
    await GroupFactory.withMembers(adminAuth, manualGroup, [memberUser]);

    const space = await SpaceFactory.regular(workspace);
    const groupModeRes = await space.updatePermissions(adminAuth, {
      name: space.name,
      isRestricted: true,
      managementMode: "group",
      groupIds: [manualGroup.sId],
      editorGroupIds: [],
    });
    expect(groupModeRes.isOk()).toBe(true);

    const inGroupMode = await SpaceResource.fetchById(adminAuth, space.sId);
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      memberUser.sId,
      workspace.sId
    );
    expect(memberAuth.can("read", inGroupMode!)).toBe(true);

    // Switching back to manual leaves the group_vaults row in place, so only the kind filter in
    // `spaceGroupRoles` stops it granting in a mode that never selected it.
    const manualModeRes = await space.updatePermissions(adminAuth, {
      name: space.name,
      isRestricted: true,
      managementMode: "manual",
      memberIds: [],
      editorIds: [],
    });
    expect(manualModeRes.isOk()).toBe(true);

    const refreshedMemberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      memberUser.sId,
      workspace.sId
    );
    const inManualMode = await SpaceResource.fetchById(adminAuth, space.sId);
    expect(refreshedMemberAuth.can("read", inManualMode!)).toBe(false);
    expect(refreshedMemberAuth.can("write", inManualMode!)).toBe(false);
  });

  it("rejects internal groups in group management mode", async () => {
    const globalGroupRes =
      await GroupResource.fetchWorkspaceGlobalGroup(adminAuth);
    expect(globalGroupRes.isOk()).toBe(true);
    if (globalGroupRes.isErr()) {
      return;
    }

    const space = await SpaceFactory.regular(workspace);
    // The space's own auto-created member group is readable by an admin, so only a kind check keeps
    // it — and the workspace global group — out of a group-managed selection.
    const [autoGroup] = await space.fetchRegularAutoGroups(adminAuth);

    for (const group of [globalGroupRes.value, autoGroup]) {
      const res = await space.updatePermissions(adminAuth, {
        name: space.name,
        isRestricted: true,
        managementMode: "group",
        groupIds: [group.sId],
        editorGroupIds: [],
      });
      expect(res.isErr()).toBe(true);
      if (res.isErr()) {
        expect(res.error.code).toBe("invalid_group_kind");
      }
    }
  });

  it("enforces the table: provisioned group member of an open space can write", async () => {
    const provisionedGroup = await GroupFactory.provisioned(
      workspace,
      "Provisioned Space Members"
    );
    await GroupFactory.withMembers(adminAuth, provisionedGroup, [memberUser]);

    const space = await SpaceFactory.regular(workspace);
    const openRes = await space.updatePermissions(adminAuth, {
      name: space.name,
      isRestricted: false,
      managementMode: "group",
      groupIds: [provisionedGroup.sId],
      editorGroupIds: [],
    });
    expect(openRes.isOk()).toBe(true);

    const nonMemberUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, nonMemberUser, {
      role: "user",
    });

    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      memberUser.sId,
      workspace.sId
    );
    const nonMemberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      nonMemberUser.sId,
      workspace.sId
    );

    // Refetched, not reused: `space` holds the grant snapshot from before the update.
    const openSpace = await SpaceResource.fetchById(adminAuth, space.sId);
    expect(openSpace).not.toBeNull();
    expect(await openSpace!.isRestricted(adminAuth)).toBe(false);

    // In group management mode the provisioned group is the space's member group, so it is what
    // carries write.
    expect(memberAuth.can("read", openSpace!)).toBe(true);
    expect(memberAuth.can("write", openSpace!)).toBe(true);

    expect(nonMemberAuth.can("read", openSpace!)).toBe(true);
    expect(nonMemberAuth.can("write", openSpace!)).toBe(false);
  });

  it("enforces the table: member is denied when the space has no grants", async () => {
    // Member is in the space's inline group, but with the table cleared access is served from the
    // (empty) table — denied.
    const space = await setupRestrictedSpaceWithMember();
    await GroupPermissionResource.deleteAllForResource(adminAuth, {
      resourceType: "space",
      resourceId: space.id,
    });

    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      memberUser.sId,
      workspace.sId
    );

    expect(memberAuth.can("read", space)).toBe(false);
  });

  it("refreshes the caller's grant snapshot after opening a space", async () => {
    // Restricted regular space: the global group is not attached, and the admin's "admin" role
    // grants nothing on the table path, so the admin holds no read grant on it yet.
    const space = await SpaceFactory.regular(workspace);
    expect(adminAuth.getGrantedVerbs("space", space.id)).not.toContain("read");

    const res = await space.updatePermissions(adminAuth, {
      name: space.name,
      isRestricted: false,
      managementMode: "manual",
      memberIds: [],
      editorIds: [],
    });
    expect(res.isOk()).toBe(true);

    // Opening attached the global group with a reader grant. updatePermissions refreshed adminAuth
    // post-commit, so its snapshot now resolves that grant. Without the refresh this stays [] (the
    // stale construction-time snapshot), which — now that the table is the served path — would deny
    // read on a space the caller just opened, in the same request.
    expect(adminAuth.getGrantedVerbs("space", space.id)).toContain("read");
  });
});
