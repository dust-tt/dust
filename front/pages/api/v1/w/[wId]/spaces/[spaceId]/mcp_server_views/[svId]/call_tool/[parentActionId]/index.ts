import { buildMCPApproveExecutionEvent } from "@app/lib/actions/mcp_internal_actions/events";
import { getExecutionStatusFromConfig } from "@app/lib/actions/tool_status";
import { getUserMessageIdFromMessageId } from "@app/lib/api/assistant/conversation/messages";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { createMCPAction } from "@app/lib/api/mcp/create_mcp";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import {
  buildSandboxCallContext,
  extractSandboxClaims,
  findExistingSandboxChild,
} from "@app/lib/api/sandbox/call_tool";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import { launchSandboxChildToolWorkflow } from "@app/temporal/agent_loop/client";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import { CallMCPToolRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

type CallToolPendingResponse = {
  status: "pending";
  childActionId: string;
};

type EndpointResponse = NextApiResponse<
  WithAPIErrorResponse<CallToolPendingResponse>
>;

/**
 * @ignoreswagger
 * internal endpoint
 *
 * POST /api/v1/w/[wId]/spaces/[spaceId]/mcp_server_views/[svId]/call_tool/[parentActionId]
 *
 * Sandbox-bash-issued tool invocation. Creates a child `AgentMCPAction`
 * sharing the parent bash's stepContent (via the new join). Either:
 *   - allowed-immediately: kicks off the dedicated single-action temporal
 *     workflow that runs the tool. Returns 202 with the child action id.
 *   - blocked: emits a `tool_approve_execution` event so the existing FE
 *     listing path picks it up (the child is a regular row in
 *     `agent_mcp_actions`, no bubble-up logic needed). Returns 202.
 *
 * The Rust client polls `[parentActionId]/[childActionId]` until terminal.
 */

async function handler(
  req: NextApiRequest,
  res: EndpointResponse,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST is supported.",
      },
    });
  }

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

  const { svId, parentActionId } = req.query;
  if (!isString(svId) || !isString(parentActionId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid path parameters.",
      },
    });
  }

  const view = await MCPServerViewResource.fetchById(auth, svId);
  if (!view || view.space.sId !== space.sId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "mcp_server_view_not_found",
        message: "MCP server view not found in this space.",
      },
    });
  }

  const sandboxClaims = await extractSandboxClaims(
    req.headers.authorization?.replace("Bearer ", "")
  );
  if (!sandboxClaims) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: "Valid sandbox token required.",
      },
    });
  }

  // Pin the JWT to the URL: a token issued for parent A cannot mint actions
  // under parent B in the same workspace.
  if (sandboxClaims.aaId !== parentActionId) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: "Sandbox token does not match the parent action in the URL.",
      },
    });
  }

  const parent = await AgentMCPActionResource.fetchById(auth, parentActionId);
  if (!parent) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message: "Parent action not found.",
      },
    });
  }

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
  const { toolName } = bodyRes.data;
  const toolArgs = bodyRes.data.arguments ?? {};

  // Idempotency: if the parent re-runs (post-pause-resume) or the Rust client
  // retries, we must not create a duplicate child row or re-emit an approval
  // event. Match on (parent, toolName, augmentedInputs) and surface the
  // existing child id for the Rust client to poll.
  const existing = await findExistingSandboxChild(auth, {
    parent,
    toolName,
    augmentedInputs: toolArgs,
  });
  if (existing) {
    res.status(202).json({ status: "pending", childActionId: existing.sId });
    return;
  }

  const callContext = await buildSandboxCallContext(auth, sandboxClaims, {
    parent,
    toolName,
    view,
  });
  if (!callContext) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message:
          "Could not build agent loop context from sandbox token claims.",
      },
    });
  }

  const { runContext, fullToolConfiguration } = callContext;

  const { status: stakeStatus } = await getExecutionStatusFromConfig(auth, {
    actionConfiguration: fullToolConfiguration,
    agentMessage: runContext.agentMessage,
    context: {
      agentId: runContext.agentConfiguration.sId,
      toolInputs: toolArgs,
    },
  });

  // Create the child audit row up-front. It shares the parent bash's
  // stepContent (via the new join). The `resumeState.parentActionId` lets
  // `validateAction` recognize this as a sandbox child and dispatch to the
  // single-action workflow on approval (instead of the agent-loop relaunch
  // which would also re-pick the parent bash).
  const child = await createMCPAction(auth, {
    actionConfiguration: fullToolConfiguration,
    agentMessage: runContext.agentMessage,
    augmentedInputs: toolArgs,
    status: stakeStatus,
    stepContentId: parent.stepContent.id,
    stepContext: {
      ...parent.stepContext,
      resumeState: {
        type: "sandbox_child",
        parentActionId: parent.sId,
      },
    },
  });

  if (stakeStatus === "blocked_validation_required") {
    const approvalEvent = buildMCPApproveExecutionEvent(child, {
      agentName: runContext.agentConfiguration.name,
      conversationId: runContext.conversation.sId,
      messageId: runContext.agentMessage.sId,
      userId: auth.user()?.sId,
      isLastBlockingEventForStep: true,
    });

    await getRedisHybridManager().publish(
      getMessageChannelId(runContext.agentMessage.sId),
      JSON.stringify({ ...approvalEvent, step: parent.stepContent.step }),
      "user_message_events"
    );

    res.status(202).json({ status: "pending", childActionId: child.sId });
    return;
  }

  // Allowed-immediately: kick off the single-action temporal workflow. The
  // bash inside the VM polls the child endpoint until the action becomes
  // terminal.
  const userMessageInfo = await getUserMessageIdFromMessageId(auth, {
    messageId: runContext.agentMessage.sId,
  });

  await launchSandboxChildToolWorkflow({
    auth,
    agentLoopArgs: {
      agentMessageId: userMessageInfo.agentMessageId,
      agentMessageVersion: userMessageInfo.agentMessageVersion,
      conversationId: runContext.conversation.sId,
      conversationTitle: runContext.conversation.title,
      conversationBranchId: userMessageInfo.branchId,
      userMessageId: userMessageInfo.userMessageId,
      userMessageVersion: userMessageInfo.userMessageVersion,
      userMessageOrigin: userMessageInfo.userMessageOrigin,
      initialStartTime: Date.now(),
    },
    actionModelId: child.id,
    step: parent.stepContent.step,
  });

  res.status(202).json({ status: "pending", childActionId: child.sId });
}

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
