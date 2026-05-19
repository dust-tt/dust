import { Hono } from "hono";

import { getConversationApiError } from "@app/lib/api/assistant/conversation/helper";
import { fetchConversationParticipants } from "@app/lib/api/assistant/participants";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationError } from "@app/types/assistant/conversation";

import { jsonApiError } from "@front-api/middleware/utils";

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
    return jsonApiError(c, getConversationApiError(conversationRes.error));
  }

  const participantsRes = await fetchConversationParticipants(
    auth,
    conversationRes.value
  );
  if (participantsRes.isErr()) {
    return c.json(
      {
        error: {
          type: "conversation_not_found",
          message: "Conversation not found",
        },
      },
      404
    );
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
    return jsonApiError(c, getConversationApiError(conversationRes.error));
  }

  const conversation = conversationRes.value;
  const u = auth.user();
  if (!u) {
    return c.json(
      {
        error: {
          type: "app_auth_error",
          message: "User not authenticated",
        },
      },
      401
    );
  }

  const user = u.toJSON();

  const isAlreadyParticipant =
    await ConversationResource.isConversationParticipant(auth, {
      conversation,
      user,
    });

  if (isAlreadyParticipant) {
    return jsonApiError(
      c,
      getConversationApiError(new ConversationError("user_already_participant"))
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
