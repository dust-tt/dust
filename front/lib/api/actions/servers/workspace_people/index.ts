import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import {
  GET_WORKSPACE_MEMBERS_CONTEXT_TOOL_NAME,
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

const MAX_RESULTS = 100;

type WorkspaceMemberContext = {
  user: UserResource;
  role: MembershipResource["role"];
  jobType: JobType | null;
  groupNames: string[];
};

async function fetchByUserIds(
  auth: Authenticator,
  userIds: string[]
): Promise<Result<WorkspaceMemberContext[], MCPError>> {
  const uniqueUserIds = [...new Set(userIds)];
  const users = await UserResource.fetchByIds(uniqueUserIds);
  const userBySId = new Map(users.map((user) => [user.sId, user]));
  const missingUserIds = uniqueUserIds.filter(
    (userId) => !userBySId.has(userId)
  );
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
  const membershipByUserId = new Map(
    memberships.map((membership) => [membership.userId, membership])
  );
  const inactiveUserIds = users
    .filter((user) => !membershipByUserId.has(user.id))
    .map((user) => user.sId);
  if (inactiveUserIds.length > 0) {
    return new Err(
      new MCPError(
        `Users are not active members of this workspace: ${inactiveUserIds.join(", ")}.`
      )
    );
  }

  const userModelIds = users.map((user) => user.id);
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

  return new Ok(
    uniqueUserIds.flatMap((userId) => {
      const user = userBySId.get(userId);
      if (!user) {
        return [];
      }
      const membership = membershipByUserId.get(user.id);
      if (!membership) {
        return [];
      }
      const jobTypeValue = jobTypesByUserId.get(user.id);
      const jobType = isJobType(jobTypeValue) ? jobTypeValue : null;
      return [
        {
          user,
          role: membership.role,
          jobType,
          groupNames: groupNamesByUserId.get(user.id) ?? [],
        },
      ];
    })
  );
}

async function fetchByJobType(
  auth: Authenticator,
  jobType: JobType
): Promise<Result<WorkspaceMemberContext[], MCPError>> {
  const workspace = auth.getNonNullableWorkspace();

  // List all active members, then filter by job type client-side.
  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });
  const membershipByUserId = new Map(memberships.map((m) => [m.userId, m]));

  const userModelIds = memberships.map((m) => m.userId);
  const jobTypesByUserId =
    await UserResource.fetchUserScopedMetadataValuesByUserModelIds(
      "job_type",
      userModelIds
    );

  const matchingModelIds = userModelIds
    .filter((id) => jobTypesByUserId.get(id) === jobType)
    .slice(0, MAX_RESULTS);

  if (matchingModelIds.length === 0) {
    return new Ok([]);
  }

  const [users, groupNamesByUserId] = await Promise.all([
    UserResource.fetchByModelIds(matchingModelIds),
    GroupResource.listGroupNamesByUserModelIdInWorkspace({
      workspace,
      userModelIds: matchingModelIds,
      groupKinds: [...MANAGEABLE_GROUP_KINDS],
    }),
  ]);

  return new Ok(
    users.flatMap((user) => {
      const membership = membershipByUserId.get(user.id);
      if (!membership) {
        return [];
      }
      return [
        {
          user,
          role: membership.role,
          jobType,
          groupNames: groupNamesByUserId.get(user.id) ?? [],
        },
      ];
    })
  );
}

async function fetchWorkspaceMemberContexts(
  auth: Authenticator,
  { userIds, jobType }: { userIds?: string[]; jobType?: JobType }
): Promise<Result<WorkspaceMemberContext[], MCPError>> {
  if (!auth.isAdmin()) {
    return new Err(
      new MCPError(
        "Only workspace admins can retrieve other members' workspace context."
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

  if (userIds) {
    return fetchByUserIds(auth, userIds);
  }
  return fetchByJobType(auth, jobType as JobType);
}

const handlers: ToolHandlers<typeof WORKSPACE_PEOPLE_TOOLS_METADATA> = {
  get_workspace_members_context: async ({ userIds, jobType }, { auth }) => {
    const contextsResult = await fetchWorkspaceMemberContexts(auth, {
      userIds,
      jobType,
    });
    if (contextsResult.isErr()) {
      return contextsResult;
    }

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify(
          contextsResult.value.map(({ user, role, jobType, groupNames }) => ({
            userId: user.sId,
            name: user.fullName() || user.email,
            email: user.email,
            role,
            jobFunction: jobType
              ? { value: jobType, label: JOB_TYPE_LABELS[jobType] }
              : null,
            groups: groupNames,
          }))
        ),
      },
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
    if (
      tool.name === GET_WORKSPACE_MEMBERS_CONTEXT_TOOL_NAME &&
      !auth.isAdmin()
    ) {
      continue;
    }
    registerTool(auth, toolContext, server, tool, {
      monitoringName: WORKSPACE_PEOPLE_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
