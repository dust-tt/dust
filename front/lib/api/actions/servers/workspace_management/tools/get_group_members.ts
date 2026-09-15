import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { workspaceManagerGuard } from "@app/lib/actions/mcp_internal_actions/utils";
import {
  DEFAULT_MEMBERS_PAGE_SIZE,
  MAX_MEMBERS_PAGE_SIZE,
} from "@app/lib/api/actions/servers/workspace_management/metadata";
import {
  makeTextLines,
  paginate,
  renderPageFooter,
} from "@app/lib/api/actions/servers/workspace_management/tools/utils";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { isManageableGroupKind } from "@app/types/groups";
import { Err, Ok } from "@app/types/shared/result";

// Same visibility as list_groups: only provisioned and regular_manual groups resolve, so the
// internal groups stay hidden even to a caller who knows their id.
export async function getGroupMembers(
  {
    groupId,
    cursor,
    limit,
  }: {
    groupId: string;
    cursor?: number;
    limit?: number;
  },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const denied = workspaceManagerGuard(auth);
  if (denied) {
    return new Err(denied);
  }

  const groupRes = await GroupResource.fetchById(auth, groupId);
  if (groupRes.isErr() || !isManageableGroupKind(groupRes.value.kind)) {
    return new Err(
      new MCPError(`Group not found: ${groupId}.`, { tracked: false })
    );
  }
  const group = groupRes.value;

  // Like list_workspace_members' groupId path: paginate the membership ids first, so only the
  // current page's users are fetched.
  const membersByGroupId = await GroupResource.getActiveMembershipsForGroups(
    auth,
    [group]
  );
  const paginated = paginate(membersByGroupId[group.id] ?? [], {
    cursor,
    limit,
    defaultPageSize: DEFAULT_MEMBERS_PAGE_SIZE,
    maxPageSize: MAX_MEMBERS_PAGE_SIZE,
  });
  if (paginated.isErr()) {
    return new Err(paginated.error);
  }
  const { page, total, nextCursor } = paginated.value;

  if (page.length === 0) {
    return new Ok([
      {
        type: "text" as const,
        text: `Group ${group.name} [${group.sId}] has no members.`,
      },
    ]);
  }

  const users = await UserResource.fetchByModelIds(page);
  // Group memberships can outlive the workspace membership; only active members are listed.
  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace: auth.getNonNullableWorkspace(),
    users,
  });
  const activeUserModelIds = new Set(memberships.map((m) => m.userId));

  const lines = users
    .filter((user) => activeUserModelIds.has(user.id))
    .map((user) => `${user.fullName() || user.email} [${user.sId}]`);

  if (total > page.length) {
    lines.push(renderPageFooter({ shown: page.length, total, nextCursor }));
  }

  return new Ok([makeTextLines(lines)]);
}
