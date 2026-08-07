import { getConversationApiError } from "@app/lib/api/assistant/conversation/helper";
import type { PokeGetConversationResponseBody } from "@app/lib/api/poke/conversations";
import { getPokeConversation } from "@app/lib/poke/conversation";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import config from "./config";
import messages from "./messages";
import reinforcementTestCase from "./reinforcement_test_case";
import render from "./render";

const ParamsSchema = z.object({
  cId: z.string(),
});

const QuerySchema = z.object({
  lastValue: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// Mounted at /api/poke/workspaces/:wId/conversations/:cId.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", QuerySchema),
  async (ctx): HandlerResult<PokeGetConversationResponseBody> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");
    const { lastValue, limit } = ctx.req.valid("query");

    const conversationRes = await getPokeConversation(
      auth,
      cId,
      true,
      limit
        ? {
            limit,
            lastRank: lastValue ?? null,
          }
        : undefined,
      false
    );
    if (conversationRes.isErr()) {
      return apiError(ctx, getConversationApiError(conversationRes.error));
    }

    const {
      hasMore,
      lastValue: paginationLastValue,
      ...conversation
    } = conversationRes.value;

    return ctx.json({
      conversation,
      ...(hasMore !== undefined
        ? { hasMore, lastValue: paginationLastValue ?? null }
        : {}),
    });
  }
);

app.route("/config", config);
app.route("/messages", messages);
app.route("/reinforcement_test_case", reinforcementTestCase);
app.route("/render", render);

export default app;
