import { createPlugin } from "@app/lib/api/poke/types";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { GroupSpaceEditorResource } from "@app/lib/resources/group_space_editor_resource";
import { GroupSpaceMemberResource } from "@app/lib/resources/group_space_member_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { UserType } from "@app/types/user";

const updatePodMembersLogger = logger.child({
  activity: "update-pod-members",
});

function formatMemberLabel(member: {
  fullName: string | null;
  email: string | null;
}): string {
  return member.fullName
    ? `${member.fullName} (${member.email})`
    : (member.email ?? member.fullName ?? "Unknown user");
}

async function syncGroupMembers(
  auth: Authenticator,
  group: GroupResource,
  selectedMemberIds: string[]
): Promise<
  Result<
    { added: string[]; removed: string[]; userMap: Map<string, UserType> },
    Error
  >
> {
  const currentMembers = await group.getActiveMembers(auth);
  const currentMemberIds = new Set(currentMembers.map((member) => member.sId));

  const newMemberIds = new Set(selectedMemberIds);
  const usersToAdd = selectedMemberIds.filter(
    (id) => !currentMemberIds.has(id)
  );
  const usersToRemove = Array.from(currentMemberIds).filter(
    (id) => !newMemberIds.has(id)
  );

  if (usersToAdd.length === 0 && usersToRemove.length === 0) {
    return new Ok({ added: [], removed: [], userMap: new Map() });
  }

  const allUserIds = [...usersToAdd, ...usersToRemove];
  const userResources =
    allUserIds.length > 0 ? await UserResource.fetchByIds(allUserIds) : [];
  const userMap = new Map(
    userResources.map((user) => [user.sId, user.toJSON()])
  );

  if (usersToAdd.length > 0) {
    const usersToAddTypes = removeNulls(
      usersToAdd.map((id) => userMap.get(id))
    );
    const addResult = await group.dangerouslyAddMembers(auth, {
      users: usersToAddTypes,
    });
    if (addResult.isErr()) {
      return new Err(
        new Error(`Failed to add members: ${addResult.error.message}`)
      );
    }
  }

  if (usersToRemove.length > 0) {
    const usersToRemoveTypes = removeNulls(
      usersToRemove.map((id) => userMap.get(id))
    );
    const removeResult = await group.dangerouslyRemoveMembers(auth, {
      users: usersToRemoveTypes,
    });
    if (removeResult.isErr()) {
      return new Err(
        new Error(`Failed to remove members: ${removeResult.error.message}`)
      );
    }
  }

  return new Ok({ added: usersToAdd, removed: usersToRemove, userMap });
}

async function getManualMemberGroup(
  space: SpaceResource
): Promise<GroupResource | null> {
  const memberGroupSpaces = await GroupSpaceMemberResource.fetchBySpace({
    space,
    filterOnManagementMode: true,
  });
  if (memberGroupSpaces.length !== 1) {
    return null;
  }
  return memberGroupSpaces[0].group;
}

async function getManualEditorGroup(
  space: SpaceResource
): Promise<GroupResource | null> {
  const editorGroupSpaces = await GroupSpaceEditorResource.fetchBySpace({
    space,
    filterOnManagementMode: true,
  });
  if (editorGroupSpaces.length !== 1) {
    return null;
  }
  return editorGroupSpaces[0].group;
}

export const updatePodMembersPlugin = createPlugin({
  manifest: {
    id: "update-pod-members",
    name: "Update Pod Members & Editors",
    description:
      "Select which workspace members should be in this pod's member and editor groups. Uncheck to remove, check to add.",
    warning:
      "WARNING: This plugin must not be used without the explicit approval of the customer.",
    resourceTypes: ["spaces"],
    args: {
      members: {
        type: "enum",
        label: "Members",
        description: "Select members who should have access to this pod",
        async: true,
        values: [],
        multiple: true,
      },
      editors: {
        type: "enum",
        label: "Editors",
        description: "Select members who should be editors of this pod",
        async: true,
        values: [],
        multiple: true,
      },
    },
  },
  populateAsyncArgs: async (auth, resource) => {
    if (!resource) {
      return new Ok({ members: [], editors: [] });
    }

    const { members: allMembers } = await getMembers(auth, {
      activeOnly: true,
    });

    const memberGroup = await getManualMemberGroup(resource);
    const editorGroup = await getManualEditorGroup(resource);

    const currentMembers = memberGroup
      ? await memberGroup.getActiveMembers(auth)
      : [];
    const currentEditors = editorGroup
      ? await editorGroup.getActiveMembers(auth)
      : [];

    const memberIds = new Set(currentMembers.map((member) => member.sId));
    const editorIds = new Set(currentEditors.map((editor) => editor.sId));

    return new Ok({
      members: allMembers.map((member) => ({
        label: formatMemberLabel(member),
        value: member.sId,
        checked: memberIds.has(member.sId),
      })),
      editors: allMembers.map((member) => ({
        label: formatMemberLabel(member),
        value: member.sId,
        checked: editorIds.has(member.sId),
      })),
    });
  },
  execute: async (auth, resource, args) => {
    if (!resource) {
      return new Err(new Error("Pod not found"));
    }

    if (!resource.isProject()) {
      return new Err(new Error("This plugin only applies to pods"));
    }

    if (resource.managementMode !== "manual") {
      return new Err(
        new Error(
          "This plugin only applies to pods with manual member management"
        )
      );
    }

    const memberGroup = await getManualMemberGroup(resource);
    if (!memberGroup) {
      return new Err(new Error("Pod does not have a member group"));
    }

    const editorGroup = await getManualEditorGroup(resource);
    if (!editorGroup) {
      return new Err(new Error("Pod does not have an editor group"));
    }

    const selectedMemberIds = args.members ?? [];
    const selectedEditorIds = args.editors ?? [];

    const memberSyncResult = await syncGroupMembers(
      auth,
      memberGroup,
      selectedMemberIds
    );
    if (memberSyncResult.isErr()) {
      return new Err(
        new Error(`Failed to update members: ${memberSyncResult.error.message}`)
      );
    }

    const editorSyncResult = await syncGroupMembers(
      auth,
      editorGroup,
      selectedEditorIds
    );
    if (editorSyncResult.isErr()) {
      return new Err(
        new Error(`Failed to update editors: ${editorSyncResult.error.message}`)
      );
    }

    const {
      added: membersAdded,
      removed: membersRemoved,
      userMap: memberUserMap,
    } = memberSyncResult.value;
    const {
      added: editorsAdded,
      removed: editorsRemoved,
      userMap: editorUserMap,
    } = editorSyncResult.value;

    if (
      membersAdded.length === 0 &&
      membersRemoved.length === 0 &&
      editorsAdded.length === 0 &&
      editorsRemoved.length === 0
    ) {
      return new Ok({
        display: "text",
        value:
          "No changes needed - member and editor lists are already up to date.",
      });
    }

    const userMap = new Map([...memberUserMap, ...editorUserMap]);
    const formatNames = (userIds: string[]) =>
      removeNulls(userIds.map((id) => userMap.get(id))).map(
        (user) => user.fullName || user.email
      );

    let message = "Successfully updated pod access:";
    if (membersAdded.length > 0) {
      message += `\n- Members added: ${formatNames(membersAdded).join(", ")}`;
    }
    if (membersRemoved.length > 0) {
      message += `\n- Members removed: ${formatNames(membersRemoved).join(", ")}`;
    }
    if (editorsAdded.length > 0) {
      message += `\n- Editors added: ${formatNames(editorsAdded).join(", ")}`;
    }
    if (editorsRemoved.length > 0) {
      message += `\n- Editors removed: ${formatNames(editorsRemoved).join(", ")}`;
    }

    updatePodMembersLogger.info(
      {
        action: "update_pod_members",
        spaceId: resource.sId,
        spaceName: resource.name,
        workspaceId: auth.getNonNullableWorkspace().sId,
        membersAdded: membersAdded.map((userId) => ({ userId })),
        membersRemoved: membersRemoved.map((userId) => ({ userId })),
        editorsAdded: editorsAdded.map((userId) => ({ userId })),
        editorsRemoved: editorsRemoved.map((userId) => ({ userId })),
      },
      "Pod members and editors updated via poke"
    );

    return new Ok({
      display: "text",
      value: message,
    });
  },
  isApplicableTo: (_auth, resource) => {
    if (!resource) {
      return false;
    }
    return resource.isProject() && resource.managementMode === "manual";
  },
});
