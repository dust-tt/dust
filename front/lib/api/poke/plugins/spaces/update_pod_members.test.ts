import { updatePodMembersPlugin } from "@app/lib/api/poke/plugins/spaces/update_pod_members";
import { Authenticator } from "@app/lib/auth";
import { GroupSpaceEditorResource } from "@app/lib/resources/group_space_editor_resource";
import { GroupSpaceMemberResource } from "@app/lib/resources/group_space_member_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

describe("updatePodMembersPlugin", () => {
  it("restores members and editors on an orphaned pod", async () => {
    const workspace = await WorkspaceFactory.basic();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });

    const pod = await SpaceFactory.project(workspace);
    const memberGroupSpaces = await GroupSpaceMemberResource.fetchBySpace({
      space: pod,
      filterOnManagementMode: true,
    });
    const editorGroupSpaces = await GroupSpaceEditorResource.fetchBySpace({
      space: pod,
      filterOnManagementMode: true,
    });

    const memberGroup = memberGroupSpaces[0].group;
    const editorGroup = editorGroupSpaces[0].group;

    const activeMemberGroupMembers =
      await memberGroup.getActiveMembers(adminAuth);
    for (const member of activeMemberGroupMembers) {
      await memberGroup.dangerouslyRemoveMembers(adminAuth, {
        users: [member.toJSON()],
      });
    }

    const activeEditorGroupMembers =
      await editorGroup.getActiveMembers(adminAuth);
    for (const member of activeEditorGroupMembers) {
      await editorGroup.dangerouslyRemoveMembers(adminAuth, {
        users: [member.toJSON()],
      });
    }

    const reloadedPod = await SpaceResource.fetchById(adminAuth, pod.sId);
    expect(reloadedPod).not.toBeNull();
    expect(updatePodMembersPlugin.isApplicableTo(adminAuth, reloadedPod)).toBe(
      true
    );

    const result = await updatePodMembersPlugin.execute(
      adminAuth,
      reloadedPod,
      {
        members: [user.sId],
        editors: [user.sId],
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.value).toContain("Successfully updated pod access");
    }

    const updatedMemberGroupMembers =
      await memberGroup.getActiveMembers(adminAuth);
    const updatedEditorGroupMembers =
      await editorGroup.getActiveMembers(adminAuth);

    expect(updatedMemberGroupMembers.map((member) => member.sId)).toEqual([
      user.sId,
    ]);
    expect(updatedEditorGroupMembers.map((member) => member.sId)).toEqual([
      user.sId,
    ]);
  });

  it("returns a no-op message when membership is already correct", async () => {
    const workspace = await WorkspaceFactory.basic();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });

    const pod = await SpaceFactory.project(workspace, user.id);
    const memberGroupSpaces = await GroupSpaceMemberResource.fetchBySpace({
      space: pod,
      filterOnManagementMode: true,
    });
    const editorGroupSpaces = await GroupSpaceEditorResource.fetchBySpace({
      space: pod,
      filterOnManagementMode: true,
    });

    await memberGroupSpaces[0].group.dangerouslyAddMembers(adminAuth, {
      users: [user.toJSON()],
    });

    const reloadedPod = await SpaceResource.fetchById(adminAuth, pod.sId);
    const currentEditors =
      await editorGroupSpaces[0].group.getActiveMembers(adminAuth);

    const result = await updatePodMembersPlugin.execute(
      adminAuth,
      reloadedPod,
      {
        members: [user.sId],
        editors: currentEditors.map((editor) => editor.sId),
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.value).toContain("No changes needed");
    }
  });
});
