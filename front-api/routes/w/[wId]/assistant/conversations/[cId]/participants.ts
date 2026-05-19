import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";

import { fetchConversationParticipants } from "@app/lib/api/assistant/participants";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationError } from "@app/types/assistant/conversation";

import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";

// Mounted at /api/w/:wId/assistant/conversations/:cId/participants.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const conversationId = c.req.param("cId") ?? "";

  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );
  if (conversationRes.isErr()) {
    return apiErrorForConversation(c, conversationRes.error);
  }

  const participantsRes = await fetchConversationParticipants(
    auth,
    conversationRes.value
  );
  if (participantsRes.isErr()) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found",
      },
    });
  }

  return c.json({ participants: participantsRes.value });
});

app.post("/", async (c) => {
  const auth = c.get("auth");
  const conversationId = c.req.param("cId") ?? "";

  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );
  if (conversationRes.isErr()) {
    return apiErrorForConversation(c, conversationRes.error);
  }

  const conversation = conversationRes.value;
  const u = auth.user();
  if (!u) {
    return apiError(c, {
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
      c,
      new ConversationError("user_already_participant")
    );
  }

  await ConversationResource.upsertParticipation(auth, {
    conversation,
    user,
    action: "subscribed",
    lastReadAt: new Date(),
  });

  return c.body(null, 201);
});

export default app;
