import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import { getExecutionStatusFromConfig } from "@app/lib/actions/tool_status";
import type { ToolContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import {
  ACTIVATION_RECOMMENDATIONS_SERVER_NAME,
  ACTIVATION_RECOMMENDATIONS_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/activation_recommendations/metadata";
import type { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { ActivationRecommendationResource } from "@app/lib/resources/activation_recommendation_resource";
import { ActivationWorkAreaResource } from "@app/lib/resources/activation_work_area_resource";
import type { MCPServerConnectionConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { MCPOAuthUseCase } from "@app/types/oauth/lib";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type ToolExecutionMode = "auto" | "requires_approval" | "not_connected";

type DelegatedWorkAreaTarget = {
  user: UserResource;
  membership: MembershipResource;
};

async function authorizeDelegatedWorkAreaTarget(
  auth: Authenticator,
  targetUser: UserResource
): Promise<Result<MembershipResource, MCPError>> {
  if (!auth.isAdmin()) {
    return new Err(
      new MCPError(
        "Only workspace admins can manage work areas for another user."
      )
    );
  }

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user: targetUser,
      workspace: auth.getNonNullableWorkspace(),
    });
  if (!membership) {
    return new Err(
      new MCPError(
        `User ${targetUser.sId} is not an active member of this workspace.`
      )
    );
  }

  return new Ok(membership);
}

async function resolveDelegatedWorkAreaTargets(
  auth: Authenticator,
  targetUserIds: string[]
): Promise<Result<DelegatedWorkAreaTarget[], MCPError>> {
  if (!auth.isAdmin()) {
    return new Err(
      new MCPError(
        "Only workspace admins can manage work areas for another user."
      )
    );
  }

  const uniqueTargetUserIds = [...new Set(targetUserIds)];
  const users = await UserResource.fetchByIds(uniqueTargetUserIds);
  const userBySId = new Map(users.map((user) => [user.sId, user]));
  const missingUserIds = uniqueTargetUserIds.filter(
    (targetUserId) => !userBySId.has(targetUserId)
  );
  if (missingUserIds.length > 0) {
    return new Err(
      new MCPError(`Users not found: ${missingUserIds.join(", ")}.`)
    );
  }

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace: auth.getNonNullableWorkspace(),
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
        inactiveUserIds.length === 1
          ? `User ${inactiveUserIds[0]} is not an active member of this workspace.`
          : `Users are not active members of this workspace: ${inactiveUserIds.join(", ")}.`
      )
    );
  }

  return new Ok(
    uniqueTargetUserIds.flatMap((targetUserId) => {
      const user = userBySId.get(targetUserId);
      if (!user) {
        return [];
      }
      const membership = membershipByUserId.get(user.id);
      return membership ? [{ user, membership }] : [];
    })
  );
}

function connectionTypeForOAuthUseCase(
  oAuthUseCase: MCPOAuthUseCase
): MCPServerConnectionConnectionType {
  switch (oAuthUseCase) {
    case "personal_actions":
      return "personal";
    case "platform_actions":
      return "workspace";
    default:
      assertNever(oAuthUseCase);
  }
}

async function buildConnectedServerIdsByType(
  auth: Authenticator,
  serverViews: MCPServerViewResource[]
): Promise<Record<MCPServerConnectionConnectionType, Set<string>>> {
  const neededTypes = new Set<MCPServerConnectionConnectionType>();
  for (const view of serverViews) {
    if (view.oAuthUseCase) {
      neededTypes.add(connectionTypeForOAuthUseCase(view.oAuthUseCase));
    }
  }

  const connectedByType: Record<
    MCPServerConnectionConnectionType,
    Set<string>
  > = {
    personal: new Set(),
    workspace: new Set(),
  };

  if (neededTypes.has("personal") && auth.user()) {
    const connections = await MCPServerConnectionResource.listByWorkspace(
      auth,
      { connectionType: "personal" }
    );
    connectedByType["personal"] = new Set(
      connections.map((c) => c.mcpServerId)
    );
  }
  if (neededTypes.has("workspace")) {
    const connections = await MCPServerConnectionResource.listByWorkspace(
      auth,
      { connectionType: "workspace" }
    );
    connectedByType["workspace"] = new Set(
      connections.map((c) => c.mcpServerId)
    );
  }

  return connectedByType;
}

function isServerConnected(
  view: MCPServerViewResource,
  connectedByType: Record<MCPServerConnectionConnectionType, Set<string>>
): boolean {
  if (!view.oAuthUseCase) {
    return true;
  }
  return connectedByType[connectionTypeForOAuthUseCase(view.oAuthUseCase)].has(
    view.mcpServerId
  );
}

async function resolveToolExecutionMode(
  auth: Authenticator,
  {
    view,
    toolName,
    permission,
    serverConnected,
  }: {
    view: MCPServerViewResource;
    toolName: string;
    permission: MCPToolStakeLevelType;
    serverConnected: boolean;
  }
): Promise<ToolExecutionMode> {
  if (!serverConnected) {
    return "not_connected";
  }

  const { status } = await getExecutionStatusFromConfig(auth, {
    actionConfiguration: {
      permission,
      toolServerId: view.mcpServerId,
      name: toolName,
    },
  });

  return status === "ready_allowed_implicitly" ? "auto" : "requires_approval";
}

const handlers: ToolHandlers<typeof ACTIVATION_RECOMMENDATIONS_TOOLS_METADATA> =
  {
    create_recommendation: async (
      { title, content, body, steps, ctaLabel, sourceIcon, sourceLabel },
      { auth, runContext }
    ) => {
      const conversationId = isAgentLoopRunContext(runContext)
        ? runContext.conversation.id
        : null;

      // Best-effort link to the pod the recommendation was made in: the
      // activation conversation's space is the pod itself.
      const podSpaceId = isAgentLoopRunContext(runContext)
        ? runContext.conversation.spaceId
        : null;
      const pod = podSpaceId
        ? await SpaceResource.fetchById(auth, podSpaceId)
        : null;
      const activationPod = pod
        ? await ActivationPodResource.fetchBySpace(auth, pod)
        : null;

      const rec = await ActivationRecommendationResource.makeNew(auth, {
        title,
        content,
        conversationId,
        activationPodId: activationPod?.id ?? null,
        body: body ?? null,
        steps: steps ?? null,
        ctaLabel: ctaLabel ?? null,
        sourceIcon: sourceIcon ?? null,
        sourceLabel: sourceLabel ?? null,
      });

      return new Ok([
        {
          type: "text" as const,
          text: `Recommendation recorded. recommendationId: ${rec.sId}`,
        },
      ]);
    },

    update_recommendation: async (
      { recommendationId, status, createdSkillId, createdTriggerId },
      { auth }
    ) => {
      const rec = await ActivationRecommendationResource.fetchById(
        auth,
        recommendationId
      );

      if (!rec) {
        return new Err(
          new MCPError(`Recommendation not found: ${recommendationId}.`)
        );
      }

      if (rec.userId !== auth.getNonNullableUser().id) {
        return new Err(
          new MCPError(
            `Cannot update recommendation ${recommendationId}: not owned by the calling user.`
          )
        );
      }

      let createdSkillModelId: number | undefined;
      let createdTriggerModelId: number | undefined;

      if (createdSkillId) {
        const skill = await SkillResource.fetchById(auth, createdSkillId);
        if (skill) {
          createdSkillModelId = skill.id;
        }
      }

      if (createdTriggerId) {
        const trigger = await TriggerResource.fetchById(auth, createdTriggerId);
        if (trigger) {
          createdTriggerModelId = trigger.id;
        }
      }

      await rec.updateFields({
        status,
        createdSkillModelId,
        createdTriggerModelId,
      });

      const statusMsg = status ? ` Status set to "${status}".` : "";
      const skillMsg = createdSkillModelId ? " Skill linked." : "";
      const triggerMsg = createdTriggerModelId ? " Trigger linked." : "";

      return new Ok([
        {
          type: "text" as const,
          text: `Recommendation updated.${statusMsg}${skillMsg}${triggerMsg}`,
        },
      ]);
    },

    list_recommendations: async (_params, { auth }) => {
      const recs = await ActivationRecommendationResource.fetchByUser(auth);

      if (recs.length === 0) {
        return new Ok([
          {
            type: "text" as const,
            text: "No previous recommendations for this user.",
          },
        ]);
      }

      const lines = recs.map((r, i) => {
        const statusLabel =
          r.status === "suggested"
            ? "shown (no decision yet)"
            : r.status === "executed"
              ? "accepted"
              : "dismissed";
        return `${i + 1}. [${statusLabel}] ${r.content}`;
      });

      return new Ok([
        {
          type: "text" as const,
          text: `Previous recommendations (${recs.length}):\n${lines.join("\n")}`,
        },
      ]);
    },

    list_work_areas: async (
      { podId, targetUserIds, status },
      { auth, runContext }
    ) => {
      const podSpaceId = isAgentLoopRunContext(runContext)
        ? runContext.conversation.spaceId
        : null;
      const pod = podSpaceId
        ? await SpaceResource.fetchById(auth, podSpaceId)
        : null;
      const activationPod = pod
        ? await ActivationPodResource.fetchBySpace(auth, pod)
        : null;

      if (!pod || !activationPod) {
        return new Err(
          new MCPError(
            "Work areas are only available inside an Activation Pod conversation."
          )
        );
      }
      if ((!podId && !targetUserIds) || (podId && targetUserIds)) {
        return new Err(
          new MCPError(
            "Pass exactly one of podId or targetUserIds when listing work areas."
          )
        );
      }

      let users: UserResource[];
      let rows: ActivationWorkAreaResource[];
      if (targetUserIds) {
        const targetsResult = await resolveDelegatedWorkAreaTargets(
          auth,
          targetUserIds
        );
        if (targetsResult.isErr()) {
          return targetsResult;
        }
        users = targetsResult.value.map(({ user }) => user);
        rows = await ActivationWorkAreaResource.listByUsersAndStatus(auth, {
          users,
          status,
        });
      } else {
        if (pod.sId !== podId) {
          return new Err(
            new MCPError(
              "podId must match the current Activation Pod conversation."
            )
          );
        }
        users = [auth.getNonNullableUser()];
        rows = await ActivationWorkAreaResource.listByUserAndStatus(auth, {
          status,
          activationPodModelId: activationPod.id,
        });
      }

      const workAreasByUserId = new Map<
        number,
        ReturnType<ActivationWorkAreaResource["toJSON"]>[]
      >();
      for (const row of rows) {
        const existing = workAreasByUserId.get(row.userId);
        if (existing) {
          existing.push(row.toJSON());
        } else {
          workAreasByUserId.set(row.userId, [row.toJSON()]);
        }
      }

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(
            users.map((user) => ({
              userId: user.sId,
              name: user.fullName() || user.email,
              workAreas: workAreasByUserId.get(user.id) ?? [],
            }))
          ),
        },
      ]);
    },

    create_work_areas: async ({ podId, assignments }, { auth, runContext }) => {
      const podSpaceId = isAgentLoopRunContext(runContext)
        ? runContext.conversation.spaceId
        : null;
      const pod = podSpaceId
        ? await SpaceResource.fetchById(auth, podSpaceId)
        : null;
      const activationPod = pod
        ? await ActivationPodResource.fetchBySpace(auth, pod)
        : null;

      if (!activationPod) {
        return new Err(
          new MCPError(
            "Work areas can only be created inside an Activation Pod conversation."
          )
        );
      }

      if (podId) {
        if (
          pod?.sId !== podId ||
          assignments.length !== 1 ||
          assignments[0]?.targetUserIds
        ) {
          return new Err(
            new MCPError(
              "Current-user creation requires the current podId and exactly one assignment without targetUserIds."
            )
          );
        }

        const [assignment] = assignments;
        const created = await concurrentExecutor(
          assignment.workAreas,
          (item) =>
            ActivationWorkAreaResource.makeNew(auth, {
              title: item.title,
              description: item.description,
              podId: activationPod.id,
            }),
          { concurrency: 8 }
        );
        return new Ok([
          {
            type: "text" as const,
            text: `Created ${created.length} work areas for the current Activation Pod.`,
          },
        ]);
      }

      if (assignments.some((assignment) => !assignment.targetUserIds)) {
        return new Err(
          new MCPError(
            "Delegated creation requires targetUserIds on every assignment."
          )
        );
      }
      if (!auth.isAdmin()) {
        return new Err(
          new MCPError(
            "Only workspace admins can create work areas for other users."
          )
        );
      }

      const targetUserIds = assignments.flatMap(
        (assignment) => assignment.targetUserIds ?? []
      );
      const uniqueTargetUserIds = new Set(targetUserIds);
      if (uniqueTargetUserIds.size !== targetUserIds.length) {
        return new Err(
          new MCPError(
            "Each target user may appear in only one work-area assignment."
          )
        );
      }

      const targetsResult = await resolveDelegatedWorkAreaTargets(
        auth,
        targetUserIds
      );
      if (targetsResult.isErr()) {
        return targetsResult;
      }
      const userBySId = new Map(
        targetsResult.value.map(({ user }) => [user.sId, user])
      );

      // Work areas must be scoped to the target user's Learning Space. Error if
      // any user does not have one yet — provisioning happens in a separate flow.
      const podByUserId = await ActivationPodResource.fetchByUserModelIds(
        auth,
        targetsResult.value.map(({ user }) => user.id)
      );
      const missingPodUsers = targetsResult.value.filter(
        ({ user }) => !podByUserId.has(user.id)
      );
      if (missingPodUsers.length > 0) {
        const ids = missingPodUsers.map(({ user }) => user.sId).join(", ");
        return new Err(
          new MCPError(
            `${missingPodUsers.length === 1 ? `User ${ids} does` : `Users ${ids} do`} not have a Learning Space yet. Provision one before creating work areas.`
          )
        );
      }
      const activationPodByUserId = new Map(
        [...podByUserId.entries()].map(([userId, pod]) => [userId, pod.id])
      );

      const perUserAssignments = assignments.flatMap((assignment) =>
        (assignment.targetUserIds ?? []).flatMap((targetUserId) => {
          const user = userBySId.get(targetUserId);
          const activationPodModelId = user
            ? activationPodByUserId.get(user.id)
            : undefined;
          return user && activationPodModelId !== undefined
            ? [
                {
                  owner: user,
                  activationPodModelId,
                  workAreas: assignment.workAreas,
                },
              ]
            : [];
        })
      );

      const createResult = await ActivationWorkAreaResource.makeNewForUsers(
        auth,
        { assignments: perUserAssignments }
      );
      if (createResult.isErr()) {
        return new Err(new MCPError(createResult.error.message));
      }

      return new Ok([
        {
          type: "text" as const,
          text:
            `Saved ${createResult.value.length} work areas independently for ` +
            `${targetsResult.value.length} users across ${assignments.length} approved map(s).`,
        },
      ]);
    },

    update_work_area: async (
      { workAreaId, status, title, description },
      { auth }
    ) => {
      const row = await ActivationWorkAreaResource.fetchById(auth, workAreaId);

      if (!row) {
        return new Err(new MCPError(`Work area not found: ${workAreaId}.`));
      }

      if (row.userId !== auth.getNonNullableUser().id) {
        const [targetUser] = await UserResource.fetchByModelIds([row.userId]);
        if (!targetUser) {
          return new Err(
            new MCPError(`Work area owner not found: ${workAreaId}.`)
          );
        }
        const authorizationResult = await authorizeDelegatedWorkAreaTarget(
          auth,
          targetUser
        );
        if (authorizationResult.isErr()) {
          return authorizationResult;
        }
      }

      const updateRes = await row.updateFields({
        status,
        title,
        description,
      });

      if (updateRes.isErr()) {
        return new Err(
          new MCPError(`Failed to update work area: ${updateRes.error.message}`)
        );
      }

      const parts: string[] = [`Work area ${workAreaId} updated.`];
      if (status) {
        parts.push(`Status: ${status}.`);
      }
      if (title) {
        parts.push(`Title updated.`);
      }
      if (description) {
        parts.push(`Description updated.`);
      }

      return new Ok([{ type: "text" as const, text: parts.join(" ") }]);
    },

    get_tool_execution_modes: async (
      { executionModes: executionModeFilter },
      { auth, runContext }
    ) => {
      if (!isAgentLoopRunContext(runContext)) {
        return new Err(
          new MCPError(
            "get_tool_execution_modes is only available in agent loop runs."
          )
        );
      }

      const { conversation } = runContext;
      const spaceIds = conversation.spaceId ? [conversation.spaceId] : [];

      const serverViews =
        await MCPServerViewResource.listBySpaceIdsEnsuringAutoViews(
          auth,
          spaceIds,
          { includeGlobalSpace: true, includeHeavyAttributes: ["cachedTools"] }
        );

      const connectedByType = await buildConnectedServerIdsByType(
        auth,
        serverViews
      );

      const lines: string[] = [];

      for (const view of serverViews) {
        const serverName = view.getDisplayName();
        const serverConnected = isServerConnected(view, connectedByType);

        for (const toolMeta of view.getToolPermissions) {
          const executionMode = await resolveToolExecutionMode(auth, {
            view,
            toolName: toolMeta.toolName,
            permission: toolMeta.permission,
            serverConnected,
          });

          if (
            !executionModeFilter ||
            executionModeFilter.length === 0 ||
            executionModeFilter.includes(executionMode)
          ) {
            lines.push(`${serverName}__${toolMeta.toolName}: ${executionMode}`);
          }
        }
      }

      if (lines.length === 0) {
        return new Ok([
          {
            type: "text" as const,
            text: executionModeFilter?.length
              ? `No tools with execution mode in [${executionModeFilter.join(", ")}].`
              : "No tools found.",
          },
        ]);
      }

      return new Ok([
        {
          type: "text" as const,
          text: `Tool execution modes:\n${lines.join("\n")}`,
        },
      ]);
    },
  };

export const TOOLS = buildTools(
  ACTIVATION_RECOMMENDATIONS_TOOLS_METADATA,
  handlers
);

function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): McpServer {
  const server = makeInternalMCPServer(ACTIVATION_RECOMMENDATIONS_SERVER_NAME);

  for (const tool of TOOLS) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: ACTIVATION_RECOMMENDATIONS_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
