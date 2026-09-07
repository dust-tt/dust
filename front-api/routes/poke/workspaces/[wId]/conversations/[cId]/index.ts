import { getConversationApiError } from "@app/lib/api/assistant/conversation/helper";
import { getPokeConversation } from "@app/lib/poke/conversation";
import type { PokeConversationType } from "@app/types/poke";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import config from "./config";
import consumption from "./consumption";
import messages from "./messages";
import reinforcementTestCase from "./reinforcement_test_case";
import render from "./render";
import wakeups from "./wakeups";

export type PokeGetConversationResponseBody = {
  conversation: PokeConversationType;
};

const ParamsSchema = z.object({
  cId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/conversations/:cId.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeGetConversationResponseBody> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");

    const conversationRes = await getPokeConversation(auth, cId, true);
    if (conversationRes.isErr()) {
      return apiError(ctx, getConversationApiError(conversationRes.error));
    }

    return ctx.json({ conversation: conversationRes.value });
  }
);

app.route("/config", config);
app.route("/consumption", consumption);
app.route("/messages", messages);
app.route("/reinforcement_test_case", reinforcementTestCase);
app.route("/render", render);
app.route("/wakeups", wakeups);

export default app;
