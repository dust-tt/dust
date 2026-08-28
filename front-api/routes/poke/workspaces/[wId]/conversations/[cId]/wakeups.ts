import type { PokeListConversationWakeUps } from "@app/lib/api/poke/conversations";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/conversations/:cId/wakeups.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeListConversationWakeUps> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");

    const conversation = await ConversationResource.fetchById(auth, cId, {
      includeDeleted: true,
    });
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "Conversation not found.",
        },
      });
    }

    // Every status, not just the active ones: Poke is an inspection surface, so cancelled,
    // fired and expired wake-ups are what makes the history readable.
    const wakeUps = await WakeUpResource.listByConversation(auth, conversation);

    return ctx.json({ wakeUps: wakeUps.map((w) => w.toJSON()) });
  }
);

export default app;
