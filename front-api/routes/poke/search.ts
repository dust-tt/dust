import { searchPokeResources } from "@app/lib/poke/search";
import type { PokeItemBase } from "@app/types/poke";
import { isString } from "@app/types/shared/utils/general";
import { pokeApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";

export type GetPokeSearchItemsResponseBody = {
  results: PokeItemBase[];
};

// Mounted at /api/poke/search. pokeAuth is applied by the parent poke sub-app.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<GetPokeSearchItemsResponseBody> => {
  const auth = ctx.get("auth");
  const search = ctx.req.query("search");
  if (!isString(search)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The search query parameter is required.",
      },
    });
  }

  const results = await searchPokeResources(auth, search);
  return ctx.json({ results });
});

export default app;
