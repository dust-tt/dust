import {
  PokeTriggerSearchBodySchema,
  type PokeTriggerSearchResponse,
  searchPokeTriggers,
} from "@app/lib/api/poke/triggers";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/poke/workspaces/:wId/triggers/search.
const app = pokeApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PokeTriggerSearchBodySchema),
  async (ctx): HandlerResult<PokeTriggerSearchResponse> => {
    const auth = ctx.get("auth");
    const result = await searchPokeTriggers(auth, ctx.req.valid("json"));
    if (result.isErr()) {
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to retrieve triggers.",
          },
        },
        result.error
      );
    }

    return ctx.json(result.value);
  }
);

export default app;
