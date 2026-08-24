import {
  PokeTriggerSearchBodySchema,
  type PokeTriggerSearchResponse,
  searchPokeTriggers,
} from "@app/lib/api/poke/triggers";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/poke/workspaces/:wId/triggers/search.
const app = pokeApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PokeTriggerSearchBodySchema),
  async (ctx): HandlerResult<PokeTriggerSearchResponse> => {
    const response = await searchPokeTriggers(
      ctx.get("auth"),
      ctx.req.valid("json")
    );

    return ctx.json(response);
  }
);

export default app;
