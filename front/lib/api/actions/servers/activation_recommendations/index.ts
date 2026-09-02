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
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { MCPOAuthUseCase } from "@app/types/oauth/lib";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type ToolExecutionMode = "auto" | "requires_approval" | "not_connected";

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

    list_recommendations: async (_params, { auth, runContext }) => {
      const podSpaceId = isAgentLoopRunContext(runContext)
        ? runContext.conversation.spaceId
        : null;
      const pod = podSpaceId
        ? await SpaceResource.fetchById(auth, podSpaceId)
        : null;
      const activationPod = pod
        ? await ActivationPodResource.fetchBySpace(auth, pod)
        : null;

      const recs = await ActivationRecommendationResource.fetchByUser(auth, {
        activationPodModelId: activationPod?.id,
      });

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

    list_work_areas: async ({ podId, status }, { auth, runContext }) => {
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
      if (pod.sId !== podId) {
        return new Err(
          new MCPError(
            "podId must match the current Activation Pod conversation."
          )
        );
      }
      if (!auth.can("admin", pod)) {
        return new Err(
          new MCPError("Not authorized to manage work areas for this pod.")
        );
      }

      const rows = await ActivationWorkAreaResource.listByActivationPods(auth, {
        activationPods: [activationPod],
        status,
      });

      if (rows.length === 0) {
        return new Ok([
          {
            type: "text" as const,
            text: "No work areas found.",
          },
        ]);
      }

      const lines = rows.map((r, i) => {
        const workArea = r.toJSON();
        return `${i + 1}. [${workArea.status}] ${workArea.sId} — "${workArea.title}": ${workArea.description}`;
      });

      return new Ok([
        {
          type: "text" as const,
          text: `Work areas (${rows.length}):\n${lines.join("\n")}`,
        },
      ]);
    },

    create_work_areas: async ({ workAreas }, { auth, runContext }) => {
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
            "Work areas can only be created inside an Activation Pod conversation."
          )
        );
      }
      if (!auth.can("admin", pod)) {
        return new Err(
          new MCPError("Not authorized to manage work areas for this pod.")
        );
      }

      const created = await concurrentExecutor(
        workAreas,
        (item) =>
          ActivationWorkAreaResource.makeNew(auth, {
            title: item.title,
            description: item.description,
            podId: activationPod.id,
          }),
        { concurrency: 8 }
      );

      const lines = created.map(
        (r) => `${r.sId} — "${r.title}" (status: suggested)`
      );

      return new Ok([
        {
          type: "text" as const,
          text: `Created ${created.length} work areas:\n${lines.join("\n")}`,
        },
      ]);
    },

    update_work_area: async (
      { workAreaId, status, title, description },
      { auth }
    ) => {
      const row = await ActivationWorkAreaResource.fetchById(auth, workAreaId);

      // fetchById only scopes to the workspace. Return the same not-found
      // error for missing and unauthorized rows so we don't leak existence.
      const [activationPod] = row
        ? await ActivationPodResource.fetchByModelIds(auth, [row.podId])
        : [];
      const [space] = activationPod
        ? await SpaceResource.fetchByModelIds(auth, [activationPod.spaceId])
        : [];
      if (!row || !space || !auth.can("admin", space)) {
        return new Err(new MCPError("Work area not found."));
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

function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): McpServer {
  const server = makeInternalMCPServer(ACTIVATION_RECOMMENDATIONS_SERVER_NAME);

  const tools = buildTools(ACTIVATION_RECOMMENDATIONS_TOOLS_METADATA, handlers);
  for (const tool of tools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: ACTIVATION_RECOMMENDATIONS_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
