import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const MarkAllAsReadBodySchema = z.object({
  action: z.enum(["mark_as_read"]),
  conversationIds: z.array(z.string()).min(1),
});

// Mounted at /api/w/:wId/assistant/conversations/bulk-actions.
const app = workspaceApp();

/** @ignoreswagger */
app.post("/", validate("json", MarkAllAsReadBodySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { conversationIds, action } = ctx.req.valid("json");

  if (action === "mark_as_read") {
    await ConversationResource.batchMarkAsReadAndClearActionRequired(
      auth,
      conversationIds
    );
  }

  return ctx.json({ success: true });
});

export default app;
