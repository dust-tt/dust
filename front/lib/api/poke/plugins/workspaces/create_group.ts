import { emitGroupMemberAuditLogs } from "@app/lib/api/groups/audit";
import { createPlugin } from "@app/lib/api/poke/types";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { Err, Ok } from "@app/types/shared/result";

export const createGroupPlugin = createPlugin({
  manifest: {
    id: "create-group",
    name: "Create Group",
    description:
      "Create a group in the workspace and add the given members to it.",
    resourceTypes: ["workspaces"],
    args: {
      name: {
        type: "string",
        label: "Group name",
        description: "Name of the group to create",
      },
      emails: {
        type: "text",
        label: "Emails",
        description:
          "Emails of the workspace members to add, separated by commas or new lines",
      },
    },
    requiredRoles: ["engineering", "support"],
  },
  execute: async (auth, workspace, args) => {
    const name = args.name.trim();
    if (!name) {
      return new Err(new Error("Group name is required."));
    }

    const emails = [
      ...new Set(
        args.emails
          .split(/[\s,]+/)
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
      ),
    ];
    if (emails.length === 0) {
      return new Err(new Error("At least one email is required."));
    }

    const members = await UserResource.listUserWithExactEmails(
      auth.getNonNullableWorkspace(),
      emails
    );
    const memberEmails = new Set(members.map((u) => u.email.toLowerCase()));
    const notMembers = emails.filter((e) => !memberEmails.has(e));
    if (notMembers.length > 0) {
      return new Err(
        new Error(
          `These emails are not members of the workspace: ${notMembers.join(", ")}`
        )
      );
    }

    const groupRes = await GroupResource.makeNewRegularManual(auth, {
      name,
      memberIds: members.map((u) => u.sId),
    });
    if (groupRes.isErr()) {
      return new Err(new Error(groupRes.error.message));
    }
    const { group, addedUsers } = groupRes.value;

    emitGroupMemberAuditLogs(auth, group, { addedUsers, removedUsers: [] });

    return new Ok({
      display: "text",
      value: `Created group "${group.name}" (${group.sId}) in workspace ${workspace?.sId} with ${addedUsers.length} members.`,
    });
  },
});
