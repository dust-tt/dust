import { Hono } from "hono";
import { z } from "zod";

import { ConversationResource } from "@app/lib/resources/conversation_resource";

import { validate } from "@front-api/middleware/validator";

const MarkAllAsReadBodySchema = z.object({
  action: z.enum(["mark_as_read"]),
  conversationIds: z.array(z.string()).min(1),
});

// Mounted at /api/w/:wId/assistant/conversations/bulk-actions.
const app = new Hono();

app.post("/", validate("json", MarkAllAsReadBodySchema), async (c) => {
  const auth = c.get("auth");
  const { conversationIds, action } = c.req.valid("json");

  if (action === "mark_as_read") {
    await ConversationResource.batchMarkAsReadAndClearActionRequired(
      auth,
      conversationIds
    );
  }

  return c.json({ success: true });
});

export default app;
