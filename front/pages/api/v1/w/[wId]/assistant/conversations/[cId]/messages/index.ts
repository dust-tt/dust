import type { PostMessagesResponseBody } from "@dust-tt/client";
import { PublicPostMessagesRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import { postUserMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import {
  apiErrorForConversation,
  isUserMessageContextOverflowing,
} from "@app/lib/api/assistant/conversation/helper";
import { postUserMessageAndWaitForCompletion } from "@app/lib/api/assistant/streaming/blocking";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { hasReachedPublicAPILimits } from "@app/lib/api/public_api_limits";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { UserMessageContext, WithAPIErrorResponse } from "@app/types";
import { isEmptyString } from "@app/types";
import { ExecutionModeSchema } from "@app/types/assistant/agent_run";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/messages:
 *   post:
 *     summary: Create a message
 *     description: Create a message in the workspace identified by {wId} in the conversation identified by {cId}.
 *     tags:
 *       - Conversations
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         description: ID of the conversation
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Message'
 *     responses:
 *       200:
 *         description: Message created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       429:
 *         description: Rate limit exceeded.
 *       500:
 *         description: Internal Server Error.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostMessagesResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { cId } = req.query;
  if (typeof cId !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  const conversationRes = await getConversation(auth, cId);

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversation = conversationRes.value;

  switch (req.method) {
    case "POST":
      const r = PublicPostMessagesRequestBodySchema.safeParse(req.body);
      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
        });
      }

      const executionModeParseResult = ExecutionModeSchema.safeParse(
        req.query.execution
      );
      const executionMode = executionModeParseResult.success
        ? executionModeParseResult.data
        : undefined;

      const hasReachedLimits = await hasReachedPublicAPILimits(auth);
      if (hasReachedLimits) {
        return apiError(req, res, {
          status_code: 429,
          api_error: {
            type: "rate_limit_error",
            message:
              "Monthly API usage limit exceeded. Please upgrade your plan or wait until your " +
              "limit resets next billing period.",
          },
        });
      }

      const { content, context, mentions, blocking, skipToolsValidation } =
        r.data;

      if (isEmptyString(context.username)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The context.username field is required.",
          },
        });
      }

      if (isUserMessageContextOverflowing(context)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The message.context properties (username, timezone, fullName, and email) " +
              "must be less than 255 characters.",
          },
        });
      }

      if (context.clientSideMCPServerIds) {
        const hasServerAccess = await concurrentExecutor(
          context.clientSideMCPServerIds,
          async (serverId) =>
            validateMCPServerAccess(auth, {
              serverId,
            }),
          { concurrency: 10 }
        );

        if (hasServerAccess.some((r) => r === false)) {
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "invalid_request_error",
              message:
                "User does not have access to the client-side MCP servers.",
            },
          });
        }
      }

      const isRunAgent =
        context.origin === "run_agent" || context.origin === "agent_handover";
      if (isRunAgent && !auth.isSystemKey()) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "invalid_request_error",
            message:
              "Messages from run_agent or agent_handover must come from a system key.",
          },
        });
      }
      const ctx: UserMessageContext = {
        clientSideMCPServerIds: context.clientSideMCPServerIds ?? [],
        email: context.email?.toLowerCase() ?? null,
        fullName: context.fullName ?? null,
        origin: context.origin ?? "api",
        originMessageId: context.originMessageId ?? null,
        profilePictureUrl: context.profilePictureUrl ?? null,
        timezone: context.timezone,
        username: context.username,
      };

      const messageRes =
        blocking === true
          ? await postUserMessageAndWaitForCompletion(auth, {
              content,
              context: ctx,
              conversation,
              executionMode,
              mentions,
              skipToolsValidation: skipToolsValidation ?? false,
            })
          : await postUserMessage(auth, {
              content,
              context: ctx,
              conversation,
              executionMode,
              mentions,
              skipToolsValidation: skipToolsValidation ?? false,
            });
      if (messageRes.isErr()) {
        return apiError(req, res, messageRes.error);
      }

      res.status(200).json({
        message: messageRes.value.userMessage,
        agentMessages: messageRes.value.agentMessages,
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler, {
  requiredScopes: { POST: "update:conversation" },
});
