import { retryAgentMessage } from "@app/lib/api/assistant/conversation";
import { retryBlockedActions } from "@app/lib/api/assistant/conversation/retry_blocked_actions";
import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import { DustError } from "@app/lib/error";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import { ModelSelectionSchema } from "@app/types/assistant/models/types";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const ParamsSchema = z.object({
  cId: z.string(),
  mId: z.string(),
});

export const PostRetryRequestBodySchema = z.union([
  z.null(),
  z.undefined(),
  z.literal(""),
  z.object({
    modelSelection: ModelSelectionSchema.optional(),
  }),
]);

const validateParams = validate("param", ParamsSchema);

// Existing clients POST with `Content-Type: application/json` and no body.
// Hono's JSON validator parses before Zod and 400s on that empty payload, so
// we normalize it here and still reject malformed nonempty JSON.
async function parseRetryBody(raw: string) {
  if (raw.trim() === "") {
    return { success: true as const, data: undefined };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { success: false as const, message: "malformed JSON" };
  }

  const result = PostRetryRequestBodySchema.safeParse(parsed);
  if (!result.success) {
    return {
      success: false as const,
      message: fromError(result.error).toString(),
    };
  }

  return { success: true as const, data: result.data };
}

// Mounted at /api/w/:wId/assistant/conversations/:cId/messages/:mId/retry.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/messages/{mId}/retry:
 *   post:
 *     summary: Retry an agent message
 *     description: Retry generating an agent message response, optionally retrying only blocked actions.
 *     tags:
 *       - Private Messages
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
 *       - in: path
 *         name: mId
 *         required: true
 *         description: ID of the message
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               modelSelection:
 *                 type: object
 *                 description: Optional model tier or concrete model selection for the retry.
 *                 required: [providerId, modelId]
 *                 properties:
 *                   providerId:
 *                     type: string
 *                   modelId:
 *                     type: string
 *                   reasoningEffort:
 *                     type: string
 *     responses:
 *       200:
 *         description: Successfully retried message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   $ref: '#/components/schemas/PrivateAgentMessage'
 *       401:
 *         description: Unauthorized
 */

app.post("/", validateParams, async (ctx) => {
  const auth = ctx.get("auth");
  const { cId: conversationId, mId: messageId } = ctx.req.valid("param");
  const parsedBody = await parseRetryBody(await ctx.req.text());
  if (!parsedBody.success) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${parsedBody.message}`,
      },
    });
  }
  const body = parsedBody.data;
  const modelSelection =
    body !== null && typeof body === "object" ? body.modelSelection : undefined;

  const conversationResource = await ConversationResource.fetchById(
    auth,
    conversationId
  );

  if (!conversationResource) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  const messageRes = await conversationResource.getMessageById(auth, messageId);
  if (messageRes.isErr()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message:
          "The message you're trying to retry does not exist or is not accessible.",
      },
    });
  }

  const messageModel = messageRes.value;
  if (!messageModel.agentMessage) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "The message you're trying to retry does not exist or is not an agent message.",
      },
    });
  }

  const conversation = conversationResource.toJSON();

  const renderRes = await batchRenderMessages(
    auth,
    conversationResource,
    [messageModel],
    "full"
  );
  if (renderRes.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to render message.",
      },
    });
  }

  const message = renderRes.value[0];
  if (!message || !isAgentMessageType(message)) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to render message.",
      },
    });
  }

  // If the query parameter `blocked_only` is true, we retry only the blocked
  // actions.
  if (ctx.req.query("blocked_only") === "true") {
    const retryBlockedActionsRes = await retryBlockedActions(
      auth,
      conversation,
      { messageId }
    );

    if (retryBlockedActionsRes.isErr()) {
      const { error } = retryBlockedActionsRes;

      if (
        error instanceof DustError &&
        error.code === "agent_loop_already_running"
      ) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: error.message,
          },
        });
      }

      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "invalid_request_error",
          message: "Failed to retry blocked actions.",
        },
      });
    }

    return ctx.json({ message });
  }

  const retriedMessageRes = await retryAgentMessage(auth, {
    conversationResource,
    message,
    modelSelection,
  });
  if (retriedMessageRes.isErr()) {
    return apiError(ctx, retriedMessageRes.error);
  }

  return ctx.json({ message: retriedMessageRes.value });
});

export default app;
