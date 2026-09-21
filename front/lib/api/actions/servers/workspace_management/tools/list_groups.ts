import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { workspaceManagerGuard } from "@app/lib/actions/mcp_internal_actions/utils";
import {
  makeTextLines,
  paginate,
  renderPageFooter,
} from "@app/lib/api/actions/servers/workspace_management/tools/utils";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { ManageableGroupKind } from "@app/types/groups";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import { Err, Ok } from "@app/types/shared/result";

// Only the groups admins manage themselves are listed: provisioned (identity provider) and
// regular_manual. The internal kinds (global, system, regular_auto) are
// implementation details of spaces and permissions, not groups a manager would reason about.
export async function listGroups(
  {
    kind,
    cursor,
    limit,
  }: {
    kind?: ManageableGroupKind;
    cursor?: number;
    limit?: number;
  },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const denied = workspaceManagerGuard(auth);
  if (denied) {
    return new Err(denied);
  }

  const groups = [
    ...(await GroupResource.listAllWorkspaceGroups(auth, {
      groupKinds: kind ? [kind] : [...MANAGEABLE_GROUP_KINDS],
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const paginated = paginate(groups, { cursor, limit });
  if (paginated.isErr()) {
    return new Err(paginated.error);
  }
  const { page, total, nextCursor } = paginated.value;

  if (page.length === 0) {
    return new Ok([{ type: "text" as const, text: "No groups found." }]);
  }

  const memberCounts = await GroupResource.getMemberCountsForGroups(auth, page);

  const lines = page.map(
    (group) =>
      `${group.name} [${group.sId}] - ${group.kind}, members: ${memberCounts.get(group.id) ?? 0}` +
      // Membership of such a group changes workspace roles, so the agent must know before editing.
      (group.grantedRole ? `, grants: ${group.grantedRole}` : "")
  );

  if (total > page.length) {
    lines.push(renderPageFooter({ shown: page.length, total, nextCursor }));
  }

  return new Ok([makeTextLines(lines)]);
}
