import {
  createMessageReaction,
  deleteMessageReaction,
} from "@app/lib/api/assistant/reaction";
import {
  getReactionTargetMessageType,
  publishReactionUpdate,
} from "@app/lib/api/assistant/reaction_update";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
  mId: z.string(),
});

const MessageReactionRequestBodySchema = z.object({
  reaction: z.string(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/messages/:mId/reactions.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", MessageReactionRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();
    const { cId: conversationId, mId: messageId } = ctx.req.valid("param");

    const conversation = await ConversationResource.fetchById(
      auth,
      conversationId
    );
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "Conversation not found.",
        },
      });
    }

    if (conversation.space && !conversation.space.isMember(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "You are not a member of the Pod.",
        },
      });
    }

    const { reaction } = ctx.req.valid("json");

    const targetKind = await getReactionTargetMessageType(auth, {
      conversation,
      messageId,
    });
    if (targetKind === null) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The message you're trying to react to does not exist.",
        },
      });
    }
    if (targetKind === "compaction") {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Reactions are not allowed on compaction messages.",
        },
      });
    }
    if (targetKind === "content_fragment") {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Reactions are not allowed on content fragments.",
        },
      });
    }

    const conversationJSON = conversation.toJSON();

    const created = await createMessageReaction(auth, {
      messageId,
      conversation: conversationJSON,
      user: user.toJSON(),
      context: {
        username: user.username,
        fullName: user.fullName(),
      },
      reaction,
    });

    if (created) {
      const pubRes = await publishReactionUpdate(auth, {
        conversation,
        messageId,
      });
      if (pubRes.isErr()) {
        logger.error(
          { err: pubRes.error, conversationId, messageId },
          "Failed to publish reaction update."
        );
      }
      return ctx.json({ success: true });
    }

    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The message you're trying to react to does not exist.",
      },
    });
  }
);

app.delete(
  "/",
  validate("param", ParamsSchema),
  validate("json", MessageReactionRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();
    const { cId: conversationId, mId: messageId } = ctx.req.valid("param");

    const conversation = await ConversationResource.fetchById(
      auth,
      conversationId
    );
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "Conversation not found.",
        },
      });
    }

    if (conversation.space && !conversation.space.isMember(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "You are not a member of the Pod.",
        },
      });
    }

    const { reaction } = ctx.req.valid("json");

    const targetKind = await getReactionTargetMessageType(auth, {
      conversation,
      messageId,
    });
    if (targetKind === null) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The message you're trying to react to does not exist.",
        },
      });
    }
    if (targetKind === "compaction") {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Reactions are not allowed on compaction messages.",
        },
      });
    }
    if (targetKind === "content_fragment") {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Reactions are not allowed on content fragments.",
        },
      });
    }

    const conversationJSON = conversation.toJSON();

    const deleted = await deleteMessageReaction(auth, {
      messageId,
      conversation: conversationJSON,
      user: user.toJSON(),
      context: {
        username: user.username,
        fullName: user.fullName(),
      },
      reaction,
    });

    if (deleted) {
      const pubRes = await publishReactionUpdate(auth, {
        conversation,
        messageId,
      });
      if (pubRes.isErr()) {
        logger.error(
          { err: pubRes.error, conversationId, messageId },
          "Failed to publish reaction update."
        );
      }
      return ctx.json({ success: true });
    }

    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The message you're trying to react to does not exist.",
      },
    });
  }
);

export default app;
