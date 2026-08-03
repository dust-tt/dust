import {
  dismissMention,
  validateUserMention,
} from "@app/lib/api/assistant/conversation/mentions";
import { validateAgentMention } from "@app/lib/api/assistant/conversation/validate_agent_mention";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { PostMentionActionResponseBody } from "@app/types/api/assistant/conversation/mentions";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
  mId: z.string(),
});

const PostMentionActionRequestBodySchema = z.object({
  type: z.enum(["agent", "user"]),
  id: z.string(),
  action: z.enum(["approved", "rejected", "dismissed"]),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/messages/:mId/mentions.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", PostMentionActionRequestBodySchema),
  async (ctx): HandlerResult<PostMentionActionResponseBody> => {
    const auth = ctx.get("auth");
    const { cId, mId } = ctx.req.valid("param");

    const conversation = await ConversationResource.fetchById(auth, cId);
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "Conversation not found.",
        },
      });
    }

    const { type, id, action } = ctx.req.valid("json");

    if (action === "dismissed") {
      const dismissMentionRes = await dismissMention(auth, {
        conversationId: cId,
        messageId: mId,
        type,
        id,
      });
      if (dismissMentionRes.isErr()) {
        return apiError(ctx, dismissMentionRes.error);
      }
    } else if (type === "user") {
      const validateUserMentionRes = await validateUserMention(auth, {
        conversationId: cId,
        userId: id,
        messageId: mId,
        approvalState: action,
      });

      if (validateUserMentionRes.isErr()) {
        return apiError(ctx, validateUserMentionRes.error);
      }
    } else {
      const validateAgentMentionRes = await validateAgentMention(auth, {
        conversationId: cId,
        agentConfigurationId: id,
        messageId: mId,
        approvalState: action,
      });

      if (validateAgentMentionRes.isErr()) {
        return apiError(ctx, validateAgentMentionRes.error);
      }
    }

    return ctx.json({ success: true });
  }
);

export default app;
