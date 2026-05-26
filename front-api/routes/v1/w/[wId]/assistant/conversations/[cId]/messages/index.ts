import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import {
  isUserMessageContextValid,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { isUserMessageContextOverflowing } from "@app/lib/api/assistant/conversation/helper";
import { postUserMessageAndWaitForCompletion } from "@app/lib/api/assistant/streaming/blocking";
import { addBackwardCompatibleAgentMessageFields } from "@app/lib/api/v1/backward_compatibility";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { UserMessageContext } from "@app/types/assistant/conversation";
import { isEmptyString } from "@app/types/shared/utils/general";
import {
  type PostMessagesResponseBody,
  PublicPostMessagesRequestBodySchema,
} from "@dust-tt/client";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

import message from "./[mId]";

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/messages.
const app = publicApiApp();

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
 *       403:
 *         description: Forbidden. Workspace or usage limits exceeded, or access denied.
 *       429:
 *         description: Rate limit exceeded.
 *       500:
 *         description: Internal Server Error.
 */
app.post(
  "/",
  validate("json", PublicPostMessagesRequestBodySchema),
  async (ctx): HandlerResult<PostMessagesResponseBody> => {
    const auth = ctx.get("auth");
    const cId = ctx.req.param("cId") ?? "";

    const conversationRes = await getConversation(auth, cId);

    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }

    const conversation = conversationRes.value;

    const {
      content,
      context,
      mentions,
      blocking,
      skipToolsValidation,
      agenticMessageData,
    } = ctx.req.valid("json");

    const origin = context.origin ?? "api";

    if (isEmptyString(context.username)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The context.username field is required.",
        },
      });
    }

    if (isUserMessageContextOverflowing(context)) {
      return apiError(ctx, {
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
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "invalid_request_error",
            message:
              "User does not have access to the client-side MCP servers.",
          },
        });
      }
    }

    const isRunAgent = !!agenticMessageData;
    if (isRunAgent && !auth.isSystemKey()) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "invalid_request_error",
          message:
            "Messages from run_agent or agent_handover must come from a system key.",
        },
      });
    }

    const messageContext: UserMessageContext = {
      clientSideMCPServerIds: context.clientSideMCPServerIds ?? [],
      email: context.email?.toLowerCase() ?? null,
      fullName: context.fullName ?? null,
      origin,
      profilePictureUrl: context.profilePictureUrl ?? null,
      timezone: context.timezone,
      username: context.username,
    };

    const headers: Record<string, string | string[] | undefined> = {};
    ctx.req.raw.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const validateUserMessageContextRes = isUserMessageContextValid(
      auth,
      headers,
      messageContext
    );
    if (!validateUserMessageContextRes) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "This origin is not allowed. Remove the origin from the context property.",
        },
      });
    }

    const messageRes =
      blocking === true
        ? await postUserMessageAndWaitForCompletion(auth, {
            content,
            context: messageContext,
            agenticMessageData,
            conversation,
            mentions,
            skipToolsValidation: skipToolsValidation ?? false,
          })
        : await postUserMessage(auth, {
            content,
            context: messageContext,
            agenticMessageData,
            conversation,
            mentions,
            skipToolsValidation: skipToolsValidation ?? false,
          });
    if (messageRes.isErr()) {
      return apiError(ctx, messageRes.error);
    }

    return ctx.json({
      message: messageRes.value.userMessage,
      agentMessages: messageRes.value.agentMessages.map(
        addBackwardCompatibleAgentMessageFields
      ),
    });
  }
);

app.route("/:mId", message);

export default app;
