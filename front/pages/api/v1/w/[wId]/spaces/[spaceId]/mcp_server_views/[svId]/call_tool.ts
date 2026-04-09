import { FALLBACK_MCP_TOOL_STAKE_LEVEL } from "@app/lib/actions/constants";
import type { LightServerSideMCPToolConfigurationType } from "@app/lib/actions/mcp";
import {
  callMCPToolForSandbox,
  makeServerSideMCPToolConfigurations,
} from "@app/lib/actions/mcp_actions";
import type { MCPApproveExecutionEvent } from "@app/lib/actions/mcp_internal_actions/events";
import { getExecutionStatusFromConfig } from "@app/lib/actions/tool_status";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  isLightServerSideMCPToolConfiguration,
  isServerSideMCPServerConfiguration,
} from "@app/lib/actions/types/guards";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { resolveSkillMCPServers } from "@app/lib/api/assistant/skill_actions";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { DEFAULT_MCP_TOOL_RETRY_POLICY } from "@app/lib/api/mcp";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import {
  type SandboxExecTokenPayload,
  verifySandboxExecTokenWithRevocation,
} from "@app/lib/api/sandbox/access_tokens";
import {
  type Authenticator,
  getFeatureFlags,
  isSandboxTokenPrefix,
} from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { apiError } from "@app/logger/withlogging";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentMessageType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { CallMCPToolResponseType } from "@dust-tt/client";
import { CallMCPToolRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

type CallToolPendingResponseType = {
  status: "pending";
  actionId: string;
};

type ApprovalStatusResponseType = {
  status: "pending" | "approved" | "rejected" | "error";
};

type CallToolEndpointResponseType =
  | CallMCPToolResponseType
  | CallToolPendingResponseType
  | ApprovalStatusResponseType;

const DEFAULT_SANDBOX_STEP_CONTEXT = {
  citationsCount: 0,
  citationsOffset: 0,
  resumeState: null,
  retrievalTopK: 10,
  websearchResultCount: 10,
} as const;

async function extractSandboxClaims(
  req: NextApiRequest
): Promise<SandboxExecTokenPayload | null> {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || !isSandboxTokenPrefix(token)) {
    return null;
  }
  return verifySandboxExecTokenWithRevocation(token);
}

async function buildSandboxAgentLoopContext(
  auth: Authenticator,
  claims: SandboxExecTokenPayload,
  {
    mcpServerViewId,
    toolName,
    mcpServerId,
    view,
  }: {
    mcpServerViewId: string;
    toolName: string;
    mcpServerId: string;
    view: MCPServerViewResource;
  }
): Promise<AgentLoopContextType | undefined> {
  const [agentConfiguration, conversationResult] = await Promise.all([
    getAgentConfiguration(auth, {
      agentId: claims.aId,
      variant: "full",
    }),
    getConversation(auth, claims.cId),
  ]);

  if (!agentConfiguration || conversationResult.isErr()) {
    return undefined;
  }

  const conversation = conversationResult.value;

  // Find the agent message from the conversation content.
  const agentMessage = conversation.content
    .flat()
    .find(
      (m): m is AgentMessageType =>
        m.type === "agent_message" && m.sId === claims.mId
    );

  if (!agentMessage) {
    return undefined;
  }

  // Find the matching server-side action config for this server view.
  // Search agent-configured actions first, then fall back to JIT servers
  // (tools added via the conversation input bar).
  let serverSideConfig = agentConfiguration.actions
    .filter(isServerSideMCPServerConfiguration)
    .find((a) => a.mcpServerViewId === mcpServerViewId);

  if (!serverSideConfig) {
    const { servers: jitServers } = await getJITServers(auth, {
      agentConfiguration,
      conversation,
      attachments: [],
    });
    serverSideConfig = jitServers.find(
      (s) => s.mcpServerViewId === mcpServerViewId
    );
  }

  if (!serverSideConfig) {
    const skillServers = await resolveSkillMCPServers(auth, {
      agentConfiguration,
      conversation,
    });
    serverSideConfig = skillServers
      .filter(isServerSideMCPServerConfiguration)
      .find((s) => s.mcpServerViewId === mcpServerViewId);
  }

  if (!serverSideConfig) {
    return undefined;
  }

  const actualPermission =
    view.getToolPermission(toolName) ?? FALLBACK_MCP_TOOL_STAKE_LEVEL;

  const [toolConfiguration] = makeServerSideMCPToolConfigurations(
    serverSideConfig,
    [
      {
        name: toolName,
        description: "",
        availability: "manual",
        stakeLevel: actualPermission,
        toolServerId: mcpServerId,
        retryPolicy: DEFAULT_MCP_TOOL_RETRY_POLICY,
      },
    ]
  );

  return {
    runContext: {
      agentConfiguration,
      agentMessage,
      conversation,
      stepContext: DEFAULT_SANDBOX_STEP_CONTEXT,
      toolConfiguration,
    },
  };
}

/**
 * Creates a blocked action for a sandbox tool call that needs user approval.
 * Returns the action's sId so the client can poll for approval status.
 */
async function createBlockedSandboxAction(
  auth: Authenticator,
  {
    agentConfiguration,
    agentMessage,
    conversation,
    toolConfiguration,
    toolArgs,
  }: {
    agentConfiguration: AgentConfigurationType;
    agentMessage: AgentMessageType;
    conversation: ConversationWithoutContentType;
    toolConfiguration: LightServerSideMCPToolConfigurationType;
    toolArgs: Record<string, unknown>;
  }
): Promise<string> {
  // Find the current (parent) step — the one running the sandbox bash tool.
  const [existingSteps, existingActions] = await Promise.all([
    AgentStepContentResource.fetchByAgentMessages(auth, {
      agentMessageIds: [agentMessage.agentMessageId],
    }),
    AgentMCPActionResource.listByAgentMessageIds(auth, [
      agentMessage.agentMessageId,
    ]),
  ]);

  const currentStep =
    existingSteps.length > 0
      ? Math.max(...existingSteps.map((s) => s.step))
      : 0;

  // Get the stepContext from the running action on this step (the sandbox bash tool).
  const parentAction = existingActions.find((a) => a.status === "running");
  const parentStepContext = parentAction?.stepContext ?? {
    ...DEFAULT_SANDBOX_STEP_CONTEXT,
  };

  // Create step content for the blocked action on the same step.
  const stepContent = await AgentStepContentResource.createNewVersion({
    workspaceId: auth.getNonNullableWorkspace().id,
    agentMessageId: agentMessage.agentMessageId,
    step: currentStep,
    index: existingSteps.filter((s) => s.step === currentStep).length,
    type: "function_call",
    value: {
      type: "function_call",
      value: {
        name: toolConfiguration.name,
        arguments: JSON.stringify(toolArgs),
        id: generateRandomModelSId(),
      },
    },
  });

  // Create blocked action in DB.
  const action = await AgentMCPActionResource.makeNew(auth, {
    agentMessageId: agentMessage.agentMessageId,
    augmentedInputs: toolArgs,
    citationsAllocated: 0,
    mcpServerConfigurationId: toolConfiguration.id.toString(),
    status: "blocked_validation_required",
    stepContentId: stepContent.id,
    stepContext: {
      ...parentStepContext,
      sandboxOrigin: true,
    },
    toolConfiguration,
    version: 0,
  });

  // Publish approval event to the frontend.
  const approvalEvent: MCPApproveExecutionEvent = {
    type: "tool_approve_execution",
    actionId: action.sId,
    configurationId: agentConfiguration.sId,
    conversationId: conversation.sId,
    created: Date.now(),
    inputs: toolArgs,
    messageId: agentMessage.sId,
    stake: toolConfiguration.permission,
    userId: auth.getNonNullableUser().sId,
    isLastBlockingEventForStep: true,
    metadata: {
      toolName: toolConfiguration.originalName,
      mcpServerName: toolConfiguration.mcpServerName,
      agentName: agentConfiguration.name,
      icon: toolConfiguration.icon,
    },
    argumentsRequiringApproval: toolConfiguration.argumentsRequiringApproval,
  };

  await publishConversationRelatedEvent({
    event: approvalEvent,
    conversationId: conversation.sId,
    step: currentStep,
  });

  // Publish to sandbox-specific channel for the bash handler (ticket 5).
  await getRedisHybridManager().publish(
    `sandbox:blocked:${agentMessage.sId}`,
    JSON.stringify({ actionId: action.sId }),
    "message_events"
  );

  return action.sId;
}

/**
 * @ignoreswagger
 * internal endpoint
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<CallToolEndpointResponseType>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("sandbox_tools")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "MCP is not enabled for this workspace.",
      },
    });
  }

  const { svId } = req.query;
  if (!isString(svId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid svId parameter.",
      },
    });
  }

  const view = await MCPServerViewResource.fetchById(auth, svId);
  if (!view) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "mcp_server_view_not_found",
        message: "MCP server view not found.",
      },
    });
  }

  if (view.space.sId !== space.sId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "mcp_server_view_not_found",
        message: "MCP server view not found in this space.",
      },
    });
  }

  const { method } = req;

  switch (method) {
    case "POST": {
      const bodyRes = CallMCPToolRequestBodySchema.safeParse(req.body);
      if (!bodyRes.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${bodyRes.error.message}`,
          },
        });
      }

      const {
        toolName,
        arguments: toolArgs = {},
        actionId: actionIdParam,
      } = bodyRes.data;

      // Build agent loop context from sandbox token if available.
      const sandboxClaims = await extractSandboxClaims(req);
      const agentLoopContext = sandboxClaims
        ? await buildSandboxAgentLoopContext(auth, sandboxClaims, {
            mcpServerViewId: view.sId,
            toolName,
            mcpServerId: view.mcpServerId,
            view,
          })
        : undefined;

      // Check tool stakes when we have a full sandbox context.
      const runContext = agentLoopContext?.runContext;
      if (
        runContext &&
        isLightServerSideMCPToolConfiguration(runContext.toolConfiguration)
      ) {
        if (actionIdParam) {
          // Re-POST after approval: verify the action is approved and proceed.
          const action = await AgentMCPActionResource.fetchById(
            auth,
            actionIdParam
          );
          if (!action) {
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "invalid_request_error",
                message: "Action not found.",
              },
            });
          }

          if (action.status !== "ready_allowed_explicitly") {
            return apiError(req, res, {
              status_code: 403,
              api_error: {
                type: "invalid_request_error",
                message: `Action is not approved (status: ${action.status}).`,
              },
            });
          }

          // Action is approved — skip stake check, proceed to execution.
        } else {
          // First POST: check stakes and potentially return 202.
          const { status } = await getExecutionStatusFromConfig(
            auth,
            runContext.toolConfiguration,
            runContext.agentMessage,
            {
              agentId: runContext.agentConfiguration.sId,
              toolInputs: toolArgs,
            }
          );

          if (status === "blocked_validation_required") {
            const actionId = await createBlockedSandboxAction(auth, {
              agentConfiguration: runContext.agentConfiguration,
              agentMessage: runContext.agentMessage,
              conversation: runContext.conversation,
              toolConfiguration: runContext.toolConfiguration,
              toolArgs,
            });

            // Return 202 immediately — the client polls call_tool.
            return res.status(202).json({
              status: "pending",
              actionId,
            });
          }
        }
      }

      if (!runContext) {
        // Non-sandbox call: no agent loop context available.
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "invalid_request_error",
            message: "Valid sandbox token required.",
          },
        });
      }

      const result = await callMCPToolForSandbox(auth, toolArgs, runContext);

      return res.status(200).json({
        success: true,
        result: {
          content: result.content,
          isError: result.isError === true,
        },
      });
    }

    case "GET": {
      // Poll approval status for a pending sandbox tool call.
      const sandboxClaims = await extractSandboxClaims(req);
      if (!sandboxClaims) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "invalid_request_error",
            message: "Valid sandbox token required.",
          },
        });
      }

      const { actionId } = req.query;
      if (!isString(actionId)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Missing or invalid actionId query parameter.",
          },
        });
      }

      const action = await AgentMCPActionResource.fetchById(auth, actionId);
      if (!action) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: "Action not found.",
          },
        });
      }

      let approvalStatus: ApprovalStatusResponseType["status"];
      switch (action.status) {
        case "blocked_validation_required":
          approvalStatus = "pending";
          break;
        case "ready_allowed_explicitly":
          approvalStatus = "approved";
          break;
        case "denied":
          approvalStatus = "rejected";
          break;
        default:
          approvalStatus = "error";
          break;
      }

      return res.status(200).json({ status: approvalStatus });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Only POST and GET are supported.",
        },
      });
  }
}

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
