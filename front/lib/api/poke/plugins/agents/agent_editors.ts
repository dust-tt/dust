import { updateAgentPermissions } from "@app/lib/api/assistant/configuration/agent";
import { getEditors } from "@app/lib/api/assistant/editors";
import { createPlugin } from "@app/lib/api/poke/types";
import { getMembers } from "@app/lib/api/workspace";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { UserType } from "@app/types";
import { Err, Ok } from "@app/types";

const updateEditorsLogger = logger.child({ activity: "update-editors" });

export const updateEditorsPlugin = createPlugin({
  manifest: {
    id: "update-editors",
    name: "Update Agent Editors",
    description:
      "Select which members should be editors of this agent. Uncheck to remove, check to add.",
    resourceTypes: ["agents"],
    args: {
      members: {
        type: "enum",
        label: "Editors",
        description: "Select members who should be editors of this agent",
        async: true,
        values: [],
        multiple: true,
      },
    },
  },
  populateAsyncArgs: async (auth, resource) => {
    if (!resource) {
      return new Ok({ members: [] });
    }

    const { members: allMembers } = await getMembers(auth, {
      activeOnly: true,
    });

    const editors = await getEditors(auth, resource);
    const editorIds = new Set(editors.map((editor) => editor.sId));

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
      return new Err(new Error("Agent configuration not found"));
    }

    const { members } = args;
    const selectedMemberIds = members || [];

    // Get current editors
    const currentEditors = await getEditors(auth, resource);
    const currentEditorIds = new Set(
      currentEditors.map((editor) => editor.sId)
    );

    // Determine which users to add and remove
    const newEditorIds = new Set(selectedMemberIds);
    const usersToAdd = selectedMemberIds.filter(
      (id) => !currentEditorIds.has(id)
    );
    const usersToRemove = Array.from(currentEditorIds).filter(
      (id) => !newEditorIds.has(id)
    );

    // If no changes needed
    if (usersToAdd.length === 0 && usersToRemove.length === 0) {
      return new Ok({
        display: "text",
        value: "✅ No changes needed - editor list is already up to date.",
      });
    }

    // Fetch user details for logging and display
    const allUserIds = [...usersToAdd, ...usersToRemove];
    const userResources =
      allUserIds.length > 0 ? await UserResource.fetchByIds(allUserIds) : [];
    const userMap = new Map(
      userResources.map((user) => [user.sId, user.toJSON()])
    );

    // Update permissions
    const updateResult = await updateAgentPermissions(auth, {
      agent: resource,
      usersToAdd: usersToAdd
        .map((id) => userMap.get(id))
        .filter((user): user is UserType => user !== undefined),
      usersToRemove: usersToRemove
        .map((id) => userMap.get(id))
        .filter((user): user is UserType => user !== undefined),
    });

    if (updateResult.isErr()) {
      return new Err(
        new Error(`Failed to update editors: ${updateResult.error.message}`)
      );
    }

    // Prepare success message
    const addedNames = usersToAdd
      .map((id) => userMap.get(id))
      .filter((user): user is UserType => user !== undefined)
      .map((user) => user.fullName || user.email);

    const removedNames = usersToRemove
      .map((id) => userMap.get(id))
      .filter((user): user is UserType => user !== undefined)
      .map((user) => user.fullName || user.email);

    let message = "✅ Successfully updated editors:";
    if (addedNames.length > 0) {
      message += `\n• Added: ${addedNames.join(", ")}`;
    }
    if (removedNames.length > 0) {
      message += `\n• Removed: ${removedNames.join(", ")}`;
    }

    // Log the changes
    updateEditorsLogger.info(
      {
        action: "update_editors",
        agentId: resource.sId,
        agentName: resource.name,
        workspaceId: auth.getNonNullableWorkspace().sId,
        editorsAdded: usersToAdd.map((id) => ({ userId: id })),
        editorsRemoved: usersToRemove.map((id) => ({ userId: id })),
      },
      "Agent editors updated via poke"
    );

    return new Ok({
      display: "text",
      value: message,
    });
  },
  isApplicableTo: (auth, resource) => {
    if (!resource) {
      return false;
    }
    return resource.status === "active";
  },
});
