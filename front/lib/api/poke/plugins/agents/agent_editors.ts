import { updateAgentPermissions } from "@app/lib/api/assistant/configuration/agent";
import { getEditors } from "@app/lib/api/assistant/editors";
import { createPlugin } from "@app/lib/api/poke/types";
import { searchMembers } from "@app/lib/api/workspace";
import { UserResource } from "@app/lib/resources/user_resource";
import { Err, Ok } from "@app/types";

export const editEditorsPlugin = createPlugin({
  manifest: {
    id: "edit-editors",
    name: "Edit Agent Editors",
    description: "Add or remove editors for this agent.",
    resourceTypes: ["agents"],
    args: {
      action: {
        type: "enum",
        label: "Action",
        description: "Choose whether to add or remove editors",
        values: [
          { label: "Add editors", value: "add" },
          { label: "Remove editors", value: "remove" },
        ],
        multiple: false,
      },
      members: {
        type: "enum",
        label: "Members",
        description:
          "Search and select members (shows non-editors for 'Add' or current editors for 'Remove')",
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

    const { members: allMembers } = await searchMembers(
      auth,
      { searchTerm: "" },
      {
        offset: 0,
        limit: 200,
        orderColumn: "name",
        orderDirection: "asc",
      }
    );

    const editors = await getEditors(auth, resource);
    const editorIds = new Set(editors.map((e) => e.sId));

    // Return all members with a flag indicating if they're already editors
    return new Ok({
      members: allMembers.map((m) => ({
        label: m.fullName ? `${m.fullName} (${m.email})` : m.email,
        value: m.sId,
        isEditor: editorIds.has(m.sId),
      })),
    });
  },
  execute: async (auth, resource, args) => {
    if (!resource) {
      return new Err(new Error("Agent configuration not found"));
    }

    const { action, members } = args as {
      action: string[];
      members: string[];
    };
    const [actionValue] = action;

    if (!members || members.length === 0) {
      return new Err(new Error("Select at least one member"));
    }

    const selectedUserResources = await UserResource.fetchByIds(members);
    if (selectedUserResources.length === 0) {
      return new Err(new Error("No valid members selected"));
    }
    const selectedUsers = selectedUserResources.map((u) => u.toJSON());

    // Get current editors
    const currentEditors = await getEditors(auth, resource);
    const currentEditorIds = new Set(
      currentEditors.map((editor) => editor.sId)
    );

    if (actionValue === "add") {
      // Filter out members who are already editors
      const membersToAddFiltered = selectedUsers.filter(
        (member) => !currentEditorIds.has(member.sId)
      );

      if (membersToAddFiltered.length === 0) {
        return new Err(
          new Error("All selected members are already editors of this agent.")
        );
      }

      // Add the new editors
      const addResult = await updateAgentPermissions(auth, {
        agent: resource,
        usersToAdd: membersToAddFiltered,
        usersToRemove: [],
      });

      if (addResult.isErr()) {
        return new Err(
          new Error(`Failed to add editors: ${addResult.error.message}`)
        );
      }

      const addedNames = membersToAddFiltered
        .map((member) => member.fullName || member.email)
        .join(", ");
      return new Ok({
        display: "text",
        value: `✅ Successfully added ${membersToAddFiltered.length} editor(s): ${addedNames}`,
      });
    } else {
      // Filter to only include members who are currently editors
      const membersToRemove = selectedUsers.filter((member) =>
        currentEditorIds.has(member.sId)
      );

      if (membersToRemove.length === 0) {
        return new Err(
          new Error(
            "None of the selected members are currently editors of this agent."
          )
        );
      }

      // Remove the editors
      const removeResult = await updateAgentPermissions(auth, {
        agent: resource,
        usersToAdd: [],
        usersToRemove: membersToRemove,
      });

      if (removeResult.isErr()) {
        return new Err(
          new Error(`Failed to remove editors: ${removeResult.error.message}`)
        );
      }

      const removedNames = membersToRemove
        .map((member) => member.fullName || member.email)
        .join(", ");
      return new Ok({
        display: "text",
        value: `✅ Successfully removed ${membersToRemove.length} editor(s): ${removedNames}`,
      });
    }
  },
  isApplicableTo: (auth, resource) => {
    if (!resource) {
      return false;
    }
    return resource.status === "active";
  },
});
