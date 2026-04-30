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
import type { SandboxResumeState } from "@app/lib/api/actions/servers/sandbox/types";
import { SANDBOX_RESUME_STATE_TYPE } from "@app/lib/api/actions/servers/sandbox/types";
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
  isSandboxActionInClaimsSession,
  type SandboxExecTokenPayload,
  verifySandboxExecToken,
} from "@app/lib/api/sandbox/access_tokens";
import {
  type Authenticator,
  getFeatureFlags,
  isSandboxTokenPrefix,
} from "@app/lib/auth";
import {
  AgentMCPActionResource,
  type SandboxMCPAction,
} from "@app/lib/resources/agent_mcp_action_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
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
import { z } from "zod";

// Initial POST + actionId-poll-while-blocked: 202 with the actionId for the
// client to keep polling against.
type CallToolPendingResponseType = {
  status: "pending";
  actionId: string;
};

// Polling POST against a row that already executed (succeeded, errored, or in
// the unreachable `running` state). 409. The result was returned on the call
// that won execution; we do not persist it for replay.
type CallToolAlreadyExecutedResponseType = {
  status: "already_executed";
};

// Polling POST against a denied row. 403.
type CallToolRejectedResponseType = {
  status: "rejected";
};

type CallToolEndpointResponseType =
  | CallMCPToolResponseType
  | CallToolPendingResponseType
  | CallToolAlreadyExecutedResponseType
  | CallToolRejectedResponseType;

type EndpointResponse = NextApiResponse<
  WithAPIErrorResponse<CallToolEndpointResponseType>
>;

// Re-execute: only `actionId` is meaningful. The tool name and arguments are
// pulled from the stored action — accepting them in the body would let a
// caller execute under a stale approval against fresh inputs.
const ReExecuteSchema = z.object({
  actionId: z.string(),
});

// Initial call: toolName required, no actionId.
const InitialCallSchema = z.object({
  toolName: z.string(),
  arguments: z.record(z.unknown()).optional(),
});

const DEFAULT_SANDBOX_STEP_CONTEXT = {
  citationsCount: 0,
  citationsOffset: 0,
  resumeState: null,
  retrievalTopK: 10,
  websearchResultCount: 10,
} as const;

const contextBuildErrorBody = {
  status_code: 500,
  api_error: {
    type: "internal_server_error" as const,
    message: "Could not build agent loop context from sandbox token claims.",
  },
};

async function extractSandboxClaims(
  req: NextApiRequest
): Promise<SandboxExecTokenPayload | null> {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || !isSandboxTokenPrefix(token)) {
    return null;
  }
  return verifySandboxExecToken(token);
}

/**
 * Runs the tool and transitions the audit row from `ready_allowed_*` directly
 * to `succeeded`/`errored` in a single UPDATE. There is no intermediate
 * `running` state for sandbox actions — under the merged-endpoint contract
 * (one Rust client per actionId, single in-flight poll) there is no concurrency
 * to protect against, so the CAS interlock is unnecessary.
 *
 * Shared between the initial-allowed-immediately path and the polling-POST
 * path — both arrive here with the row in `ready_allowed_*`.
 */
async function executeAndRespond(
  auth: Authenticator,
  toolArgs: Record<string, unknown>,
  runContext: AgentLoopRunContextType,
  action: SandboxMCPAction,
  res: EndpointResponse
): Promise<void> {
  try {
    const result = await callMCPToolForSandbox(auth, toolArgs, runContext);
    await action.updateStatus(result.isError ? "errored" : "succeeded");
    res.status(200).json({
      success: true,
      result: {
        content: result.content,
        isError: result.isError === true,
      },
    });
  } catch (err) {
    await action.updateStatus("errored");
    throw err;
  }
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
  | {
      context: AgentLoopContextType;
      step: number;
      parentAction: AgentMCPActionResource | null;
    }
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
  // (tools added via the conversation input bar), then skill servers.
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

  // Find the parent sandbox bash action to get step context and step number.
  // Accept both `running` and `blocked_child_action_input_required`: parallel
  // sandbox calls inside one bash command may arrive after a sibling has
  // already bubbled the parent up. Filtering on `running` only would lose the
  // parent reference (and silently default `step` to 0).
  const parentAction =
    await AgentMCPActionResource.findSandboxActionForAgentMessage(auth, {
      agentMessageId: agentMessage.agentMessageId,
      statuses: ["running", "blocked_child_action_input_required"],
    });
  const stepContext = parentAction?.stepContext ?? DEFAULT_SANDBOX_STEP_CONTEXT;
  const step = parentAction?.stepContent.step ?? 0;

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
    step,
    parentAction: parentAction ?? null,
  };
}

/**
 * Bubbles up a blocked sandbox action to its parent bash `AgentMCPAction` and
 * publishes approval events. The audit row already exists — its status is
 * `blocked_validation_required`.
 *
 * The bubble-up flips the parent to `blocked_child_action_input_required` and
 * stores a sandbox `resumeState` with the child id. This mirrors how
 * `run_agent` surfaces sub-agent blocks: the FE sees a single bubbled parent
 * and resolves the child via `childBlockedActionsList`. The agent loop's
 * "any blocked actions on this message?" check naturally picks up the parent.
 */
async function notifyApprovalNeeded(
  auth: Authenticator,
  action: SandboxMCPAction,
  {
    agentConfiguration,
    agentMessage,
    conversation,
    toolConfiguration,
    toolArgs,
    step,
    parentAction,
  }: {
    agentConfiguration: AgentConfigurationType;
    agentMessage: AgentMessageType;
    conversation: ConversationWithoutContentType;
    toolConfiguration: LightServerSideMCPToolConfigurationType;
    toolArgs: Record<string, unknown>;
    step: number;
    parentAction: AgentMCPActionResource | null;
  }
): Promise<void> {
  // Bubble up to the parent bash action. Without a parent we still publish
  // the approval event below, but the agent loop won't see anything blocked.
  // In practice the parent is always present when a sandbox tool call fires.
  if (parentAction) {
    const resumeState: SandboxResumeState = {
      type: SANDBOX_RESUME_STATE_TYPE,
      childActionId: action.sId,
    };
    await parentAction.markBlockedAwaitingChild(resumeState);
  }

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
    step,
  });

  // Sandbox-specific channel — the bash handler subscribes to it to discover
  // blocked children (in addition to its DB poll).
  await getRedisHybridManager().publish(
    `sandbox:blocked:${agentMessage.sId}`,
    JSON.stringify({ actionId: action.sId }),
    "message_events"
  );
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

  // All routes require a valid sandbox token — verify once.
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

  const { method } = req;

  switch (method) {
    case "POST": {
      // POST has two shapes:
      //   - { actionId } — polling/execute. Discriminates on body, not URL.
      //     The polling POST is the executor: when the action is in
      //     `ready_allowed_*`, this same call runs the tool inline and returns
      //     the result on the response. See `handlePollingPost`.
      //   - { toolName, arguments? } — initial call. Creates the audit row,
      //     runs the stake check, and either executes inline or returns a
      //     202 + actionId for the client to start polling.
      const pollingRes = ReExecuteSchema.safeParse(req.body);
      if (pollingRes.success) {
        return handlePollingPost(req, res, auth, sandboxClaims, {
          view,
          actionId: pollingRes.data.actionId,
        });
      }

      const initialRes = InitialCallSchema.safeParse(req.body);
      if (initialRes.success) {
        return handleInitialToolCall(req, res, auth, sandboxClaims, {
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

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Only POST is supported.",
        },
      });
  }
}

/**
 * The merged polling/execute endpoint. The Rust client POSTs `{ actionId }`
 * repeatedly until it gets a non-202 response.
 *
 * Status mapping:
 *   - `blocked_*`            → 202 `{ status: "pending" }`
 *   - `ready_allowed_*`      → execute inline, return 200 + tool result
 *   - `running`              → 409 `{ status: "already_executed" }` (defensive;
 *                              sandbox flow no longer sets `running`)
 *   - `succeeded`/`errored`  → 409 `{ status: "already_executed" }` — we do
 *                              not persist tool results, so a retry after the
 *                              winning POST cannot replay. The script in the
 *                              sandbox surfaces an error and the user retries
 *                              the whole thing (which produces a new actionId).
 *   - `denied`               → 403 `{ status: "rejected" }`
 */
async function handlePollingPost(
  req: NextApiRequest,
  res: EndpointResponse,
  auth: Authenticator,
  sandboxClaims: SandboxExecTokenPayload,
  {
    view,
    actionId,
  }: {
    view: MCPServerViewResource;
    actionId: string;
  }
): Promise<void> {
  const action = await AgentMCPActionResource.fetchSandboxActionById(
    auth,
    actionId
  );
  if (
    !action ||
    !(await isSandboxActionInClaimsSession(auth, sandboxClaims, action))
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message: "Action not found.",
      },
    });
  }

  switch (action.status) {
    case "blocked_validation_required":
    case "blocked_authentication_required":
    case "blocked_file_authorization_required":
    case "blocked_child_action_input_required":
    case "blocked_user_answer_required":
      res.status(202).json({ status: "pending", actionId: action.sId });
      return;

    case "ready_allowed_explicitly":
    case "ready_allowed_implicitly": {
      // Tool name and arguments are pulled from the stored action — the user
      // approved a row whose inputs are fixed at insert time. Trusting body
      // values here would let a caller execute under a stale approval.
      const toolName = action.toolConfiguration.originalName;
      const toolArgs = action.augmentedInputs ?? {};

      const sandboxContext = await buildSandboxAgentLoopContext(
        auth,
        sandboxClaims,
        { toolName, view }
      );
      const runContext = sandboxContext?.context.runContext;
      if (!runContext) {
        await action.updateStatus("errored");
        return apiError(req, res, contextBuildErrorBody);
      }

      return executeAndRespond(auth, toolArgs, runContext, action, res);
    }

    case "running":
    case "succeeded":
    case "errored":
      // `running` is unreachable for sandbox actions today (the inline-execute
      // path goes `ready_allowed_*` → `succeeded`/`errored` in one UPDATE).
      // Bucket it with the post-execution terminals defensively rather than
      // assertNever-ing — if we ever introduce a `running` transition for
      // sandbox actions, returning 409 is still safe semantics.
      res.status(409).json({ status: "already_executed" });
      return;

    case "denied":
      res.status(403).json({ status: "rejected" });
      return;

    default:
      assertNever(action.status);
  }
}

async function handleInitialToolCall(
  req: NextApiRequest,
  res: EndpointResponse,
  auth: Authenticator,
  sandboxClaims: SandboxExecTokenPayload,
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
    return apiError(req, res, contextBuildErrorBody);
  }

  // Check tool stakes.
  const { status: stakeStatus } = await getExecutionStatusFromConfig(
    auth,
    runContext.toolConfiguration,
    runContext.agentMessage,
    {
      agentId: runContext.agentConfiguration.sId,
      toolInputs: toolArgs,
    }
  );

  // Always create the audit row up-front. The status carries whether the
  // tool will block (`blocked_validation_required`) or run immediately
  // (`ready_allowed_*`). For approved-immediately calls, executeAndRespond
  // transitions it directly to `succeeded`/`errored` in a single UPDATE.
  const action = await AgentMCPActionResource.makeNewSandboxAction(auth, {
    agentMessageId: runContext.agentMessage.agentMessageId,
    step: sandboxResult.step,
    status: stakeStatus,
    mcpServerConfigurationId: runContext.toolConfiguration.id.toString(),
    toolConfiguration: runContext.toolConfiguration,
    augmentedInputs: toolArgs,
  });

  if (stakeStatus === "blocked_validation_required") {
    await notifyApprovalNeeded(auth, action, {
      agentConfiguration: runContext.agentConfiguration,
      agentMessage: runContext.agentMessage,
      conversation: runContext.conversation,
      toolConfiguration: runContext.toolConfiguration,
      toolArgs,
      step: sandboxResult.step,
      parentAction: sandboxResult.parentAction,
    });
    res.status(202).json({
      status: "pending",
      actionId: action.sId,
    });
    return;
  }

  // Allowed-immediately path: row stays `ready_allowed_implicitly` until
  // executeAndRespond flips it to `succeeded`/`errored` in a single UPDATE.
  return executeAndRespond(auth, toolArgs, runContext, action, res);
}

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
