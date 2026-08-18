import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import {
  LIST_WORKSPACE_MEMBERS_TOOL_NAME,
  MAX_MEMBERS,
  WORKSPACE_PEOPLE_SERVER_NAME,
  WORKSPACE_PEOPLE_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/workspace_people/metadata";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import type { JobType } from "@app/types/job_type";
import { isJobType, JOB_TYPE_LABELS } from "@app/types/job_type";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
  membershipByUserId: Map<number, MembershipResource>
): Promise<WorkspaceMember[]> {
  if (users.length === 0) {
    return [];
  }
  const workspace = auth.getNonNullableWorkspace();
  const userModelIds = users.map((u) => u.id);
  const [jobTypesByUserId, groupNamesByUserId] = await Promise.all([
    UserResource.fetchUserScopedMetadataValuesByUserModelIds(
      "job_type",
      userModelIds
    ),
    GroupResource.listGroupNamesByUserModelIdInWorkspace({
      workspace,
      userModelIds,
      groupKinds: [...MANAGEABLE_GROUP_KINDS],
    }),
  ]);

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

async function listByUserIds(
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

  return new Ok(await buildMemberRows(auth, orderedUsers, membershipByUserId));
}

async function listByJobType(
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
  return new Ok(await buildMemberRows(auth, users, membershipByUserId));
}

const handlers: ToolHandlers<typeof WORKSPACE_PEOPLE_TOOLS_METADATA> = {
  list_workspace_members: async ({ userIds, jobType }, { auth }) => {
    if (!auth.isAdmin()) {
      return new Err(
        new MCPError(
          "Only workspace admins can list other members' workspace context."
        )
      );
    }

    if (userIds && jobType) {
      return new Err(
        new MCPError("Provide either userIds or jobType, not both.")
      );
    }
    if (!userIds && !jobType) {
      return new Err(new MCPError("Provide either userIds or jobType."));
    }

    const result = userIds
      ? await listByUserIds(auth, userIds)
      : await listByJobType(auth, jobType as JobType);

    if (result.isErr()) {
      return result;
    }
    return new Ok([
      { type: "text" as const, text: JSON.stringify(result.value) },
    ]);
  },
};

export const TOOLS = buildTools(WORKSPACE_PEOPLE_TOOLS_METADATA, handlers);

function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): McpServer {
  const server = makeInternalMCPServer(WORKSPACE_PEOPLE_SERVER_NAME);

  for (const tool of TOOLS) {
    if (tool.name === LIST_WORKSPACE_MEMBERS_TOOL_NAME && !auth.isAdmin()) {
      continue;
    }
    registerTool(auth, toolContext, server, tool, {
      monitoringName: WORKSPACE_PEOPLE_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
