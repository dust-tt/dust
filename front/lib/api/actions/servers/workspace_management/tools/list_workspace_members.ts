import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { workspaceManagerGuard } from "@app/lib/actions/mcp_internal_actions/utils";
import { MAX_MEMBERS } from "@app/lib/api/actions/servers/workspace_management/metadata";
import {
  makeTextLines,
  renderFields,
} from "@app/lib/api/actions/servers/workspace_management/tools/utils";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import type { JobType } from "@app/types/job_type";
import { isJobType, JOB_TYPE_LABELS } from "@app/types/job_type";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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
  userIds: string[]
): Promise<Result<WorkspaceMember[], MCPError>> {
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

  const userModelIds = orderedUsers.map((u) => u.id);
  const jobTypesByUserId =
    await UserResource.fetchUserScopedMetadataValuesByUserModelIds(
      "job_type",
      userModelIds
    );

  return new Ok(
    await buildMemberRows(
      auth,
      orderedUsers,
      membershipByUserId,
      jobTypesByUserId
    )
  );
}

async function listMembersByJobType(
  auth: Authenticator,
  jobType: JobType
): Promise<Result<WorkspaceMember[], MCPError>> {
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

  const matchingModelIds = allModelIds
    .filter((id) => jobTypesByUserId.get(id) === jobType)
    .slice(0, MAX_MEMBERS);

  if (matchingModelIds.length === 0) {
    return new Ok([]);
  }

  const users = await UserResource.fetchByModelIds(matchingModelIds);
  return new Ok(
    await buildMemberRows(auth, users, membershipByUserId, jobTypesByUserId)
  );
}

async function listMembersByGroupId(
  auth: Authenticator,
  groupId: string
): Promise<Result<WorkspaceMember[], MCPError>> {
  const groupRes = await GroupResource.fetchById(auth, groupId);
  if (groupRes.isErr()) {
    return new Err(new MCPError(`Group not found: ${groupId}.`));
  }
  const group = groupRes.value;

  const membersByGroupId = await GroupResource.getActiveMembershipsForGroups(
    auth,
    [group]
  );
  const groupMemberModelIds = (membersByGroupId[group.id] ?? []).slice(
    0,
    MAX_MEMBERS
  );

  if (groupMemberModelIds.length === 0) {
    return new Ok([]);
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

  return new Ok(
    await buildMemberRows(auth, users, membershipByUserId, jobTypesByUserId)
  );
}

// Unlike the other tools here, this one exposes other members' identity and role, so it stays
// manager-only. `createServer` also skips registering it for everyone else.
export async function listWorkspaceMembers(
  {
    userIds,
    jobType,
    groupId,
  }: { userIds?: string[]; jobType?: JobType; groupId?: string },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const denied = workspaceManagerGuard(auth);
  if (denied) {
    return new Err(denied);
  }

  const filterCount = [userIds, jobType, groupId].filter(Boolean).length;
  if (filterCount !== 1) {
    return new Err(
      new MCPError("Provide exactly one of userIds, jobType, or groupId.", {
        tracked: false,
      })
    );
  }

  const result = userIds
    ? await listMembersByUserIds(auth, userIds)
    : jobType
      ? await listMembersByJobType(auth, jobType)
      : await listMembersByGroupId(auth, groupId as string);

  if (result.isErr()) {
    return result;
  }

  if (result.value.length === 0) {
    return new Ok([{ type: "text" as const, text: "No members found." }]);
  }

  return new Ok([
    makeTextLines(
      result.value.map((member) =>
        [
          `${member.name} [${member.userId}]`,
          renderFields({
            email: member.email,
            role: member.role,
            jobFunction: member.jobFunction?.label ?? null,
            groups: member.groups.join("|") || null,
          }),
        ].join(" — ")
      )
    ),
  ]);
}
