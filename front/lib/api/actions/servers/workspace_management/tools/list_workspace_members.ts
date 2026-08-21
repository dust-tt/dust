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
  renderFields,
  renderPageFooter,
} from "@app/lib/api/actions/servers/workspace_management/tools/utils";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import type { JobType } from "@app/types/job_type";
import { isJobType, JOB_TYPE_LABELS } from "@app/types/job_type";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type MemberPage = {
  members: WorkspaceMember[];
  total: number;
  nextCursor: number | null;
};

type PageArgs = { cursor?: number; limit?: number };

// The three list paths all resolve their matches to user model ids first, so paginating the ids
// means only the current page's users, groups and job types are ever fetched.
function paginateMemberIds(
  userModelIds: ModelId[],
  { cursor, limit }: PageArgs
) {
  return paginate(userModelIds, {
    cursor,
    limit,
    defaultPageSize: DEFAULT_MEMBERS_PAGE_SIZE,
    maxPageSize: MAX_MEMBERS_PAGE_SIZE,
  });
}

type WorkspaceMember = {
  userId: string;
  name: string;
  email: string;
  role: MembershipResource["role"];
  jobFunction: { value: JobType; label: string } | null;
  groups: string[];
};

async function buildMemberRows(
  auth: Authenticator,
  users: UserResource[],
  membershipByUserId: Map<number, MembershipResource>,
  jobTypesByUserId: Map<number, string>
): Promise<WorkspaceMember[]> {
  if (users.length === 0) {
    return [];
  }
  const workspace = auth.getNonNullableWorkspace();
  const userModelIds = users.map((u) => u.id);
  const groupNamesByUserId =
    await GroupResource.listGroupNamesByUserModelIdInWorkspace({
      workspace,
      userModelIds,
      groupKinds: [...MANAGEABLE_GROUP_KINDS],
    });

  return users.flatMap((user) => {
    const membership = membershipByUserId.get(user.id);
    if (!membership) {
      return [];
    }
    const jobTypeValue = jobTypesByUserId.get(user.id);
    const jobType = isJobType(jobTypeValue) ? jobTypeValue : null;
    return [
      {
        userId: user.sId,
        name: user.fullName() || user.email,
        email: user.email,
        role: membership.role,
        jobFunction: jobType
          ? { value: jobType, label: JOB_TYPE_LABELS[jobType] }
          : null,
        groups: groupNamesByUserId.get(user.id) ?? [],
      },
    ];
  });
}

async function listMembersByUserIds(
  auth: Authenticator,
  userIds: string[],
  pageArgs: PageArgs
): Promise<Result<MemberPage, MCPError>> {
  const uniqueUserIds = [...new Set(userIds)];
  const users = await UserResource.fetchByIds(uniqueUserIds);
  const userBySId = new Map(users.map((u) => [u.sId, u]));

  const missingUserIds = uniqueUserIds.filter((id) => !userBySId.has(id));
  if (missingUserIds.length > 0) {
    return new Err(
      new MCPError(`Users not found: ${missingUserIds.join(", ")}.`)
    );
  }

  const workspace = auth.getNonNullableWorkspace();
  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
    users,
  });
  const membershipByUserId = new Map(memberships.map((m) => [m.userId, m]));

  const inactiveUserIds = users
    .filter((u) => !membershipByUserId.has(u.id))
    .map((u) => u.sId);
  if (inactiveUserIds.length > 0) {
    return new Err(
      new MCPError(
        `Users are not active members of this workspace: ${inactiveUserIds.join(", ")}.`
      )
    );
  }

  // Preserve caller-supplied order.
  const orderedUsers = uniqueUserIds.flatMap((id) => {
    const u = userBySId.get(id);
    return u ? [u] : [];
  });

  const paginated = paginateMemberIds(
    orderedUsers.map((u) => u.id),
    pageArgs
  );
  if (paginated.isErr()) {
    return new Err(paginated.error);
  }
  const { page, total, nextCursor } = paginated.value;

  const pagedUsers = orderedUsers.filter((u) => page.includes(u.id));
  const jobTypesByUserId =
    await UserResource.fetchUserScopedMetadataValuesByUserModelIds(
      "job_type",
      page
    );

  return new Ok({
    members: await buildMemberRows(
      auth,
      pagedUsers,
      membershipByUserId,
      jobTypesByUserId
    ),
    total,
    nextCursor,
  });
}

// Omitting `jobType` lists every active member.
async function listAllMembers(
  auth: Authenticator,
  jobType: JobType | undefined,
  pageArgs: PageArgs
): Promise<Result<MemberPage, MCPError>> {
  const workspace = auth.getNonNullableWorkspace();

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });
  const membershipByUserId = new Map(memberships.map((m) => [m.userId, m]));

  const allModelIds = memberships.map((m) => m.userId);
  const jobTypesByUserId =
    await UserResource.fetchUserScopedMetadataValuesByUserModelIds(
      "job_type",
      allModelIds
    );

  const matchingModelIds = jobType
    ? allModelIds.filter((id) => jobTypesByUserId.get(id) === jobType)
    : allModelIds;

  const paginated = paginateMemberIds(matchingModelIds, pageArgs);
  if (paginated.isErr()) {
    return new Err(paginated.error);
  }
  const { page, total, nextCursor } = paginated.value;

  if (page.length === 0) {
    return new Ok({ members: [], total, nextCursor });
  }

  const users = await UserResource.fetchByModelIds(page);

  return new Ok({
    members: await buildMemberRows(
      auth,
      users,
      membershipByUserId,
      jobTypesByUserId
    ),
    total,
    nextCursor,
  });
}

async function listMembersByGroupId(
  auth: Authenticator,
  groupId: string,
  pageArgs: PageArgs
): Promise<Result<MemberPage, MCPError>> {
  const groupRes = await GroupResource.fetchById(auth, groupId);
  if (groupRes.isErr()) {
    return new Err(new MCPError(`Group not found: ${groupId}.`));
  }
  const group = groupRes.value;

  const membersByGroupId = await GroupResource.getActiveMembershipsForGroups(
    auth,
    [group]
  );
  const paginated = paginateMemberIds(
    membersByGroupId[group.id] ?? [],
    pageArgs
  );
  if (paginated.isErr()) {
    return new Err(paginated.error);
  }
  const { page: groupMemberModelIds, total, nextCursor } = paginated.value;

  if (groupMemberModelIds.length === 0) {
    return new Ok({ members: [], total, nextCursor });
  }

  const workspace = auth.getNonNullableWorkspace();
  const users = await UserResource.fetchByModelIds(groupMemberModelIds);
  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
    users,
  });
  const membershipByUserId = new Map(memberships.map((m) => [m.userId, m]));
  const jobTypesByUserId =
    await UserResource.fetchUserScopedMetadataValuesByUserModelIds(
      "job_type",
      groupMemberModelIds
    );

  return new Ok({
    members: await buildMemberRows(
      auth,
      users,
      membershipByUserId,
      jobTypesByUserId
    ),
    total,
    nextCursor,
  });
}

// Unlike the other tools here, this one exposes other members' identity and role, so it stays
// manager-only. `createServer` also skips registering it for everyone else.
export async function listWorkspaceMembers(
  {
    userIds,
    jobType,
    groupId,
    cursor,
    limit,
  }: {
    userIds?: string[];
    jobType?: JobType;
    groupId?: string;
    cursor?: number;
    limit?: number;
  },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const denied = workspaceManagerGuard(auth);
  if (denied) {
    return new Err(denied);
  }

  const filterCount = [userIds, jobType, groupId].filter(Boolean).length;
  if (filterCount > 1) {
    return new Err(
      new MCPError("Provide at most one of userIds, jobType, or groupId.", {
        tracked: false,
      })
    );
  }

  const pageArgs = { cursor, limit };
  const result = userIds
    ? await listMembersByUserIds(auth, userIds, pageArgs)
    : groupId
      ? await listMembersByGroupId(auth, groupId, pageArgs)
      : await listAllMembers(auth, jobType, pageArgs);

  if (result.isErr()) {
    return result;
  }
  const { members, total, nextCursor } = result.value;

  if (members.length === 0) {
    return new Ok([{ type: "text" as const, text: "No members found." }]);
  }

  const lines = members.map((member) =>
    [
      `${member.name} [${member.userId}]`,
      renderFields({
        email: member.email,
        role: member.role,
        jobFunction: member.jobFunction?.label ?? null,
        groups: member.groups.join("|") || null,
      }),
    ].join(" — ")
  );

  if (total > members.length) {
    lines.push(renderPageFooter({ shown: members.length, total, nextCursor }));
  }

  return new Ok([makeTextLines(lines)]);
}
