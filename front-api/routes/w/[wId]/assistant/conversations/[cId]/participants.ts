import { fetchConversationParticipants } from "@app/lib/api/assistant/participants";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationError } from "@app/types/assistant/conversation";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/participants.
const app = workspaceApp();

app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { cId: conversationId } = ctx.req.valid("param");

  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );
  if (conversationRes.isErr()) {
    return apiErrorForConversation(ctx, conversationRes.error);
  }

  const participantsRes = await fetchConversationParticipants(
    auth,
    conversationRes.value
  );
  if (participantsRes.isErr()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found",
      },
    });
  }

  return ctx.json({ participants: participantsRes.value });
});

app.post("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { cId: conversationId } = ctx.req.valid("param");

  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );
  if (conversationRes.isErr()) {
    return apiErrorForConversation(ctx, conversationRes.error);
  }

  const conversation = conversationRes.value;
  const u = auth.user();
  if (!u) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "app_auth_error",
        message: "User not authenticated",
      },
    });
  }

  const user = u.toJSON();

  const isAlreadyParticipant =
    await ConversationResource.isConversationParticipant(auth, {
      conversation,
      user,
    });

  if (isAlreadyParticipant) {
    return apiErrorForConversation(
      ctx,
      new ConversationError("user_already_participant")
    );
  }

  await ConversationResource.upsertParticipation(auth, {
    conversation,
    user,
    action: "subscribed",
    lastReadAt: new Date(),
  });

  return ctx.body(null, 201);
});

export default app;
