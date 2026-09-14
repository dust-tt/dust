import { getConversationConsumption } from "@app/lib/api/assistant/agent_message_consumption_attribution/conversation_read";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { ConversationConsumptionResponse } from "@app/types/assistant/conversation_consumption";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/conversations/:cId/consumption.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<ConversationConsumptionResponse> => {
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

    const consumption = await getConversationConsumption(auth, {
      conversation,
    });

    return ctx.json(consumption);
  }
);

export default app;
