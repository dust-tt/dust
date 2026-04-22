import {
  isToolFileAuthRequiredEvent,
  isToolPersonalAuthRequiredEvent,
} from "@app/lib/actions/mcp";
import { getUserMessageIdFromMessageId } from "@app/lib/api/assistant/conversation/messages";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

export type ResolveAuthenticationOutcome = "completed" | "denied";
export type ResolveAuthenticationKind = "authentication" | "file_authorization";

const KIND_CONFIG: Record<
  ResolveAuthenticationKind,
  {
    blockedStatus:
      | "blocked_authentication_required"
      | "blocked_file_authorization_required";
    isMatchingEvent: (event: unknown) => boolean;
    label: string;
  }
> = {
  authentication: {
    blockedStatus: "blocked_authentication_required",
    isMatchingEvent: isToolPersonalAuthRequiredEvent,
    label: "authentication",
  },
  file_authorization: {
    blockedStatus: "blocked_file_authorization_required",
    isMatchingEvent: isToolFileAuthRequiredEvent,
    label: "file authorization",
  },
};

export async function resolveAuthentication(
  auth: Authenticator,
  conversation: ConversationResource,
  {
    actionId,
    messageId,
    outcome,
    kind = "authentication",
  }: {
    actionId: string;
    messageId: string;
    outcome: ResolveAuthenticationOutcome;
    kind?: ResolveAuthenticationKind;
  }
): Promise<Result<void, DustError>> {
  const { blockedStatus, isMatchingEvent, label } = KIND_CONFIG[kind];
  const owner = auth.getNonNullableWorkspace();
  const user = auth.user();
  const { sId: conversationId, title: conversationTitle } = conversation;

  logger.info(
    {
      actionId,
      messageId,
      conversationId,
      outcome,
      workspaceId: owner.sId,
      userId: user?.sId,
    },
    `Resolve ${label} request`
  );

  const {
    agentMessageId,
    agentMessageVersion,
    userMessageId,
    userMessageVersion,
    userMessageUserId,
    userMessageOrigin,
    branchId,
  } = await getUserMessageIdFromMessageId(auth, {
    messageId,
  });

  if (userMessageUserId !== user?.id) {
    return new Err(
      new DustError(
        "unauthorized",
        `User is not authorized to resolve ${label} for this action`
      )
    );
  }

  const action = await AgentMCPActionResource.fetchById(auth, actionId);
  if (!action) {
    return new Err(
      new DustError("action_not_found", `Action not found: ${actionId}`)
    );
  }

  if (action.status !== blockedStatus) {
    return new Err(
      new DustError(
        "action_not_blocked",
        `Action is not blocked for ${label}: ${action.status}`
      )
    );
  }

  const [updatedCount] = await action.updateStatus(
    outcome === "completed" ? "ready_allowed_explicitly" : "denied"
  );

  if (updatedCount === 0) {
    logger.info(
      {
        actionId,
        messageId,
        workspaceId: owner.sId,
        userId: user?.sId,
      },
      `${label} action already resolved`
    );

    return new Ok(undefined);
  }

  await getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);
    return (
      isMatchingEvent(payload) &&
      (payload as { actionId: string }).actionId === actionId
    );
  }, getMessageChannelId(messageId));

  const blockedActions =
    await AgentMCPActionResource.listBlockedActionsForConversation(
      auth,
      conversation
    );

  if (blockedActions.some((a) => a.messageId === messageId)) {
    logger.info(
      { blockedActions },
      "Skipping agent loop launch because there are remaining blocked actions"
    );
    return new Ok(undefined);
  }

  await launchAgentLoopWorkflow({
    auth,
    agentLoopArgs: {
      agentMessageId,
      agentMessageVersion,
      conversationId,
      conversationTitle,
      conversationBranchId: branchId,
      userMessageId,
      userMessageVersion,
      userMessageOrigin,
    },
    startStep: action.stepContent.step,
    waitForCompletion: true,
  });

  logger.info(
    {
      workspaceId: owner.sId,
      conversationId,
      messageId,
      actionId,
      outcome,
    },
    `${label} ${outcome}, agent loop resumed`
  );

  return new Ok(undefined);
}

const ResolveAuthenticationSchema = z.object({
  actionId: z.string(),
  outcome: z.enum(["completed", "denied"]),
});

export type ResolveAuthenticationResponse = {
  success: boolean;
};

export function makeResolveAuthenticationHandler(
  kind: ResolveAuthenticationKind
): NextApiHandler<WithAPIErrorResponse<ResolveAuthenticationResponse>> {
  async function handler(
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<ResolveAuthenticationResponse>>,
    auth: Authenticator
  ): Promise<void> {
    const { cId, mId } = req.query;
    if (!isString(cId) || !isString(mId)) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "Conversation, message, or workspace not found.",
        },
      });
    }

    if (req.method !== "POST") {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
    }

    const parseResult = ResolveAuthenticationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid request body: ${parseResult.error.message}`,
        },
      });
    }

    const conversation = await ConversationResource.fetchById(auth, cId);

    if (!conversation) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "Conversation not found.",
        },
      });
    }

    const { actionId, outcome } = parseResult.data;

    const result = await resolveAuthentication(auth, conversation, {
      actionId,
      messageId: mId,
      outcome,
      kind,
    });

    if (result.isErr()) {
      switch (result.error.code) {
        case "action_not_blocked":
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "action_not_blocked",
              message: result.error.message,
            },
          });
        case "action_not_found":
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "action_not_found",
              message: result.error.message,
            },
          });
        default:
          return apiError(
            req,
            res,
            {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: `Failed to resolve ${KIND_CONFIG[kind].label}`,
              },
            },
            result.error
          );
      }
    }

    res.status(200).json({ success: true });
  }

  return withSessionAuthenticationForWorkspace(handler);
}
