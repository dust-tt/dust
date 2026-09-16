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

// Same path as POST /api/w/{wId}/groups: the resource checks the role and the name collision,
// and seeds the members, so a group is never created empty.
export async function createGroup(
  { name, memberIds }: { name: string; memberIds: string[] },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const denied = workspaceManagerGuard(auth);
  if (denied) {
    return new Err(denied);
  }

  const groupRes = await GroupResource.makeNewRegularManual(auth, {
    name,
    memberIds,
  });
  if (groupRes.isErr()) {
    return new Err(
      new MCPError(groupRes.error.message, {
        tracked: groupRes.error.code === "unauthorized",
      })
    );
  }
  const { group, addedUsers } = groupRes.value;

  emitGroupMemberAuditLogs(auth, group, { addedUsers, removedUsers: [] });

  return new Ok([
    makeTextLines([
      `Created group ${group.name} [${group.sId}].`,
      `Members: ${addedUsers.map((u) => `${u.fullName} [${u.sId}]`).join(", ")}`,
    ]),
  ]);
}
