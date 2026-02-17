import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { UserResource } from "@app/lib/resources/user_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("GroupResource", () => {
  describe("listUserGroupModelIdsInWorkspace", () => {
    let workspace: WorkspaceType;
    let member: UserResource;

    beforeEach(async () => {
      workspace = await WorkspaceFactory.basic();
      member = await UserFactory.basic();
      await MembershipFactory.associate(workspace, member, { role: "user" });
    });

    it("returns global group and explicit groups for a workspace member", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Test Group",
        workspaceId: workspace.id,
        kind: "regular",
      });
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      await regularGroup.dangerouslyAddMembers(auth, {
        users: [member.toJSON()],
      });

      const groupIds = await GroupResource.listUserGroupModelIdsInWorkspace({
        user: member,
        workspace,
      });

      expect(groupIds.length).toBe(2);

      const globalGroup = await GroupModel.findOne({
        where: { workspaceId: workspace.id, kind: "global" },
      });
      expect(globalGroup).not.toBeNull();
      expect(groupIds).toContain(globalGroup!.id);
      expect(groupIds).toContain(regularGroup.id);
    });

    it("returns empty array for non-member", async () => {
      const nonMember = await UserFactory.basic();

      const groupIds = await GroupResource.listUserGroupModelIdsInWorkspace({
        user: nonMember,
        workspace,
      });

      expect(groupIds).toEqual([]);
    });

    it("returns groups for non-member when dangerouslySkipMembershipCheck is true", async () => {
      const nonMember = await UserFactory.basic();

      const groupIds = await GroupResource.listUserGroupModelIdsInWorkspace({
        user: nonMember,
        workspace,
        dangerouslySkipMembershipCheck: true,
      });

      // Should still return the global group even though the user is not a member.
      expect(groupIds.length).toBeGreaterThanOrEqual(1);
      const globalGroup = await GroupModel.findOne({
        where: { workspaceId: workspace.id, kind: "global" },
      });
      expect(groupIds).toContain(globalGroup!.id);
    });

    it("throws when global group is missing regardless of skip flag", async () => {
      // Delete the global group to simulate a data integrity issue.
      await GroupModel.destroy({
        where: { workspaceId: workspace.id, kind: "global" },
      });

      await expect(
        GroupResource.listUserGroupModelIdsInWorkspace({
          user: member,
          workspace,
        })
      ).rejects.toThrow("Global group not found.");

      await expect(
        GroupResource.listUserGroupModelIdsInWorkspace({
          user: member,
          workspace,
          dangerouslySkipMembershipCheck: true,
        })
      ).rejects.toThrow("Global group not found.");
    });
  });
});
