import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { workspaceManagerGuard } from "@app/lib/actions/mcp_internal_actions/utils";
import { makeTextLines } from "@app/lib/api/actions/servers/workspace_management/tools/utils";
import { emitGroupMemberAuditLogs } from "@app/lib/api/groups/audit";
import { GroupResource } from "@app/lib/resources/group_resource";
import { Err, Ok } from "@app/types/shared/result";
import type { UserType } from "@app/types/user";

function renderUsers(users: UserType[]): string {
  return users.map((u) => `${u.fullName} [${u.sId}]`).join(", ");
}

// Only regular_manual groups are editable: provisioned membership belongs to the identity
// provider, and the internal kinds are never exposed by this server. The group is fetched with
// list_groups' visibility, so a provisioned id gets an explicit refusal while an internal or
// unknown id reads as not found.
export async function updateGroupMembers(
  {
    groupId,
    additions,
    removals,
  }: {
    groupId: string;
    additions: string[];
    removals: string[];
  },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const denied = workspaceManagerGuard(auth);
  if (denied) {
    return new Err(denied);
  }

  if (additions.length === 0 && removals.length === 0) {
    return new Err(
      new MCPError("Provide at least one user id in additions or removals.", {
        tracked: false,
      })
    );
  }

  const groupRes = await GroupResource.fetchById(auth, groupId);
  if (groupRes.isErr()) {
    return new Err(
      new MCPError(`Group not found: ${groupId}.`, { tracked: false })
    );
  }
  const group = groupRes.value;

  if (group.isProvisioned()) {
    return new Err(
      new MCPError(
        `Group ${group.name} [${group.sId}] is provisioned from the identity provider and cannot be edited from Dust.`,
        { tracked: false }
      )
    );
  }
  if (!group.isRegularManual()) {
    return new Err(
      new MCPError(`Group not found: ${groupId}.`, { tracked: false })
    );
  }

  const updateRes = await group.updateRegularManualGroupMembers(auth, {
    addUserIds: additions,
    removeUserIds: removals,
  });
  if (updateRes.isErr()) {
    return new Err(
      new MCPError(updateRes.error.message, {
        tracked: updateRes.error.code === "unauthorized",
      })
    );
  }
  const { addedUsers, removedUsers } = updateRes.value;

  emitGroupMemberAuditLogs(auth, group, updateRes.value);

  const lines = [`Updated group ${group.name} [${group.sId}].`];
  if (addedUsers.length > 0) {
    lines.push(`Added: ${renderUsers(addedUsers)}`);
  }
  if (removedUsers.length > 0) {
    lines.push(`Removed: ${renderUsers(removedUsers)}`);
  }

  return new Ok([makeTextLines(lines)]);
}
