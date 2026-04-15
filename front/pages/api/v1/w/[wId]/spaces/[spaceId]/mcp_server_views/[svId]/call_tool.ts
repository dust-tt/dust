import { FALLBACK_MCP_TOOL_STAKE_LEVEL } from "@app/lib/actions/constants";
import type { LightServerSideMCPToolConfigurationType } from "@app/lib/actions/mcp";
import {
  callMCPToolForSandbox,
  makeServerSideMCPToolConfigurations,
} from "@app/lib/actions/mcp_actions";
import type { MCPApproveExecutionEvent } from "@app/lib/actions/mcp_internal_actions/events";
import { getExecutionStatusFromConfig } from "@app/lib/actions/tool_status";
import type {
  AgentLoopContextType,
  AgentLoopRunContextType,
} from "@app/lib/actions/types";
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
  verifySandboxExecToken,
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
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { CallMCPToolResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { UniqueConstraintError } from "sequelize";
import { z } from "zod";

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

type EndpointResponse = NextApiResponse<
  WithAPIErrorResponse<CallToolEndpointResponseType>
>;

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
  return verifySandboxExecToken(token);
}

async function executeSandboxToolCall(
  auth: Authenticator,
  toolArgs: Record<string, unknown>,
  runContext: AgentLoopRunContextType,
  res: EndpointResponse
): Promise<void> {
  const result = await callMCPToolForSandbox(auth, toolArgs, runContext);
  res.status(200).json({
    success: true,
    result: {
      content: result.content,
      isError: result.isError === true,
    },
  });
}

async function buildSandboxAgentLoopContext(
  auth: Authenticator,
  claims: SandboxExecTokenPayload,
  {
    toolName,
    view,
  }: {
    toolName: string;
    view: MCPServerViewResource;
  }
): Promise<
  | { context: AgentLoopContextType; existingActions: AgentMCPActionResource[] }
  | undefined
> {
  const mcpServerViewId = view.sId;
  const mcpServerId = view.mcpServerId;

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

  const [fullToolConfiguration] = makeServerSideMCPToolConfigurations(
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

  // Strip inputSchema and description so the runtime object matches
  // LightServerSideMCPToolConfigurationType — the isLight type guard checks
  // !("inputSchema" in arg), so keeping it would cause the approval flow to be
  // silently skipped.
  const {
    inputSchema: _inputSchema,
    description: _description,
    ...toolConfiguration
  } = fullToolConfiguration;

  // Fetch all actions for this message — used for stepContext lookup and
  // returned to the caller to avoid a duplicate query when checking for
  // already-approved actions.
  const existingActions = await AgentMCPActionResource.listByAgentMessageIds(
    auth,
    [agentMessage.agentMessageId]
  );
  const parentAction = existingActions.find(
    (a) =>
      a.status === "running" && a.toolConfiguration.mcpServerName === "sandbox"
  );
  const stepContext = parentAction?.stepContext ?? DEFAULT_SANDBOX_STEP_CONTEXT;

  return {
    context: {
      runContext: {
        agentConfiguration,
        agentMessage,
        conversation,
        stepContext,
        toolConfiguration,
      },
    },
    existingActions,
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
    existingActions,
  }: {
    agentConfiguration: AgentConfigurationType;
    agentMessage: AgentMessageType;
    conversation: ConversationWithoutContentType;
    toolConfiguration: LightServerSideMCPToolConfigurationType;
    toolArgs: Record<string, unknown>;
    existingActions: AgentMCPActionResource[];
  }
): Promise<string> {
  // Get the stepContext from the running action on this step (the sandbox bash tool).
  const parentAction = existingActions.find((a) => a.status === "running");
  const parentStepContext = parentAction?.stepContext ?? {
    ...DEFAULT_SANDBOX_STEP_CONTEXT,
  };

  // Create step content with retry: concurrent sandbox tool calls race to
  // insert at the same (step, index) pair, causing UniqueConstraintError.
  // On conflict we re-fetch steps to get a fresh index and retry.
  const MAX_RETRIES = 3;
  let stepContent: Awaited<
    ReturnType<typeof AgentStepContentResource.createNewVersion>
  >;
  let currentStep: number;

  for (let attempt = 0; ; attempt++) {
    const existingSteps = await AgentStepContentResource.fetchByAgentMessages(
      auth,
      {
        agentMessageIds: [agentMessage.agentMessageId],
      }
    );

    currentStep =
      existingSteps.length > 0
        ? Math.max(...existingSteps.map((s) => s.step))
        : 0;

    try {
      stepContent = await AgentStepContentResource.createNewVersion({
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
      break;
    } catch (error) {
      if (error instanceof UniqueConstraintError && attempt < MAX_RETRIES) {
        continue;
      }
      throw error;
    }
  }

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
  res: EndpointResponse,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("sandbox_dsbx_tools")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "Sandbox dsbx tools are not enabled for this workspace.",
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
      // Re-execute: actionId required, toolName optional (falls back to action record).
      // Initial call: toolName required, no actionId.
      const ReExecuteSchema = z.object({
        actionId: z.string(),
        toolName: z.string().optional(),
        arguments: z.record(z.unknown()).optional(),
      });
      const InitialCallSchema = z.object({
        toolName: z.string(),
        arguments: z.record(z.unknown()).optional(),
      });

      const reExecRes = ReExecuteSchema.safeParse(req.body);
      if (reExecRes.success) {
        return handleReExecuteApprovedToolCall(req, res, auth, {
          view,
          actionId: reExecRes.data.actionId,
          toolName: reExecRes.data.toolName,
          arguments: reExecRes.data.arguments,
        });
      }

      const initialRes = InitialCallSchema.safeParse(req.body);
      if (initialRes.success) {
        return handleInitialToolCall(req, res, auth, {
          view,
          toolName: initialRes.data.toolName,
          toolArgs: initialRes.data.arguments ?? {},
        });
      }

      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Invalid request body: must include either actionId or toolName.",
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

      // Verify the action exists, is workspace-scoped (enforced by fetchById),
      // and was created through the sandbox approval flow.
      const action = await AgentMCPActionResource.fetchById(auth, actionId);
      if (!action || !action.stepContext.sandboxOrigin) {
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
        case "blocked_authentication_required":
        case "blocked_file_authorization_required":
        case "blocked_child_action_input_required":
        case "blocked_user_answer_required":
          approvalStatus = "pending";
          break;
        case "ready_allowed_explicitly":
        case "ready_allowed_implicitly":
        case "running":
        case "succeeded":
          approvalStatus = "approved";
          break;
        case "denied":
          approvalStatus = "rejected";
          break;
        case "errored":
          approvalStatus = "error";
          break;
        default:
          assertNever(action.status);
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

async function handleReExecuteApprovedToolCall(
  req: NextApiRequest,
  res: EndpointResponse,
  auth: Authenticator,
  {
    view,
    actionId,
    toolName: bodyToolName,
    arguments: bodyArgs,
  }: {
    view: MCPServerViewResource;
    actionId: string;
    toolName?: string;
    arguments?: Record<string, unknown>;
  }
): Promise<void> {
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

  if (
    action.status === "blocked_validation_required" ||
    action.status === "denied"
  ) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: `Action is not approved (status: ${action.status}).`,
      },
    });
  }

  // Prefer the action's stored data; fall back to the request body.
  const toolName = action.toolConfiguration.originalName ?? bodyToolName;
  if (!toolName) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Could not determine tool name from action or request body.",
      },
    });
  }

  const toolArgs = bodyArgs ?? action.augmentedInputs ?? {};

  const sandboxContext = await buildSandboxAgentLoopContext(
    auth,
    sandboxClaims,
    { toolName, view }
  );

  const runContext = sandboxContext?.context.runContext;
  if (!runContext) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: "Valid sandbox token required.",
      },
    });
  }

  return executeSandboxToolCall(auth, toolArgs, runContext, res);
}

async function handleInitialToolCall(
  req: NextApiRequest,
  res: EndpointResponse,
  auth: Authenticator,
  {
    view,
    toolName,
    toolArgs,
  }: {
    view: MCPServerViewResource;
    toolName: string;
    toolArgs: Record<string, unknown>;
  }
): Promise<void> {
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

  const sandboxResult = await buildSandboxAgentLoopContext(
    auth,
    sandboxClaims,
    { toolName, view }
  );

  const runContext = sandboxResult?.context.runContext;
  if (
    !runContext ||
    !isLightServerSideMCPToolConfiguration(runContext.toolConfiguration)
  ) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: "Valid sandbox token required.",
      },
    });
  }

  // Check tool stakes.
  const { status } = await getExecutionStatusFromConfig(
    auth,
    runContext.toolConfiguration,
    runContext.agentMessage,
    {
      agentId: runContext.agentConfiguration.sId,
      toolInputs: toolArgs,
    }
  );

  if (status !== "blocked_validation_required") {
    return executeSandboxToolCall(auth, toolArgs, runContext, res);
  }

  // Create a blocked action and return 202 — the client polls GET for status.
  const actionId = await createBlockedSandboxAction(auth, {
    agentConfiguration: runContext.agentConfiguration,
    agentMessage: runContext.agentMessage,
    conversation: runContext.conversation,
    toolConfiguration: runContext.toolConfiguration,
    toolArgs,
    existingActions: sandboxResult.existingActions,
  });

  res.status(202).json({
    status: "pending",
    actionId,
  });
}

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
