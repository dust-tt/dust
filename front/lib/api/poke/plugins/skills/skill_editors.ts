import { createPlugin } from "@app/lib/api/poke/types";
import { getMembers } from "@app/lib/api/workspace";
import { UserResource } from "@app/lib/resources/user_resource";
import { launchSkillSearchIndexation } from "@app/lib/skill_search/indexation";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";

const updateSkillEditorsLogger = logger.child({
  activity: "update-skill-editors",
});

export const updateSkillEditorsPlugin = createPlugin({
  manifest: {
    id: "update-skill-editors",
    name: "Update Skill Editors",
    description:
      "Select which members should be editors of this skill. Uncheck to remove, check to add.",
    warning:
      "WARNING: This plugin must not be used without the explicit approval of the customer.",
    resourceTypes: ["skills"],
    args: {
      members: {
        type: "enum",
        label: "Editors",
        description: "Select members who should be editors of this skill",
        async: true,
        values: [],
        multiple: true,
      },
    },
    requiredRoles: ["support"],
  },
  populateAsyncArgs: async (auth, resource) => {
    if (!resource) {
      return new Ok({ members: [] });
    }

    const { members: allMembers } = await getMembers(auth, {
      activeOnly: true,
    });

    const currentEditors = (await resource.listEditors(auth)) ?? [];
    const editorIds = new Set(currentEditors.map((editor) => editor.sId));

    return new Ok({
      members: allMembers.map((member) => ({
        label: member.fullName
          ? `${member.fullName} (${member.email})`
          : member.email,
        value: member.sId,
        checked: editorIds.has(member.sId),
      })),
    });
  },
  execute: async (auth, resource, args) => {
    if (!resource) {
      return new Err(new Error("Skill not found"));
    }

    const { members } = args;
    const selectedMemberIds = members || [];

    // Get current editors.
    const currentEditors = (await resource.listEditors(auth)) ?? [];
    const currentEditorIds = new Set(
      currentEditors.map((editor) => editor.sId)
    );

    // Determine which users to add and remove.
    const newEditorIds = new Set(selectedMemberIds);
    const usersToAdd = selectedMemberIds.filter(
      (id) => !currentEditorIds.has(id)
    );
    const usersToRemove = Array.from(currentEditorIds).filter(
      (id) => !newEditorIds.has(id)
    );

    if (usersToAdd.length === 0 && usersToRemove.length === 0) {
      return new Ok({
        display: "text",
        value: "No changes needed - editor list is already up to date.",
      });
    }

    // Fetch user details for logging and display.
    const allUserIds = [...usersToAdd, ...usersToRemove];
    const userResources =
      allUserIds.length > 0 ? await UserResource.fetchByIds(allUserIds) : [];
    const userMap = new Map(
      userResources.map((user) => [user.sId, user.toJSON()])
    );

    // Keep editor permission mutations behind SkillResource.
    const userResourceMap = new Map(
      userResources.map((user) => [user.sId, user])
    );

    if (usersToAdd.length > 0) {
      const addResult = await resource.upsertEditors(
        auth,
        removeNulls(usersToAdd.map((id) => userResourceMap.get(id)))
      );
      if (addResult.isErr()) {
        await launchSkillSearchIndexation({
          workspaceId: auth.getNonNullableWorkspace().sId,
          skillId: resource.sId,
        });
        return new Err(
          new Error(`Failed to add editors: ${addResult.error.message}`)
        );
      }
    }

    if (usersToRemove.length > 0) {
      const removeResult = await resource.removeEditors(
        auth,
        removeNulls(usersToRemove.map((id) => userResourceMap.get(id)))
      );
      if (removeResult.isErr()) {
        await launchSkillSearchIndexation({
          workspaceId: auth.getNonNullableWorkspace().sId,
          skillId: resource.sId,
        });
        return new Err(
          new Error(`Failed to remove editors: ${removeResult.error.message}`)
        );
      }
    }

    await launchSkillSearchIndexation({
      workspaceId: auth.getNonNullableWorkspace().sId,
      skillId: resource.sId,
    });

    // Prepare success message.
    const addedNames = removeNulls(usersToAdd.map((id) => userMap.get(id))).map(
      (user) => user.fullName || user.email
    );

    const removedNames = removeNulls(
      usersToRemove.map((id) => userMap.get(id))
    ).map((user) => user.fullName || user.email);

    let message = "Successfully updated editors:";
    if (addedNames.length > 0) {
      message += `\n- Added: ${addedNames.join(", ")}`;
    }
    if (removedNames.length > 0) {
      message += `\n- Removed: ${removedNames.join(", ")}`;
    }

    updateSkillEditorsLogger.info(
      {
        action: "update_skill_editors",
        skillId: resource.sId,
        skillName: resource.name,
        workspaceId: auth.getNonNullableWorkspace().sId,
        editorsAdded: usersToAdd.map((id) => ({ userId: id })),
        editorsRemoved: usersToRemove.map((id) => ({ userId: id })),
      },
      "Skill editors updated via poke"
    );

    return new Ok({
      display: "text",
      value: message,
    });
  },
  isApplicableTo: (_auth, resource) => {
    return resource !== null;
  },
});
