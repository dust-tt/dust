import { getAgentMessageConsumptionWithModels } from "@app/lib/api/assistant/agent_message_consumption_attribution/read";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { AgentMessageConsumptionWithModelsResponse } from "@app/types/assistant/agent_message_consumption";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
  mId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/conversations/:cId/messages/:mId/consumption.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<AgentMessageConsumptionWithModelsResponse> => {
    const auth = ctx.get("auth");
    const { cId, mId } = ctx.req.valid("param");

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

    const consumption = await getAgentMessageConsumptionWithModels(auth, {
      conversation,
      agentMessageId: mId,
    });
    if (!consumption) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "message_not_found",
          message: "Agent message not found.",
        },
      });
    }

    return ctx.json(consumption);
  }
);

export default app;
