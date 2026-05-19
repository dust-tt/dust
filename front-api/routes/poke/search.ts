import { searchPokeResources } from "@app/lib/poke/search";
import type { PokeItemBase } from "@app/types/poke";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type GetPokeSearchItemsResponseBody = {
  results: PokeItemBase[];
};

// Mounted at /api/poke/search. pokeAuth is applied by the parent poke sub-app.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const search = c.req.query("search");
  if (typeof search !== "string") {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The search query parameter is required.",
      },
    });
  }

  const results = await searchPokeResources(auth, search);
  const body: GetPokeSearchItemsResponseBody = { results };
  return c.json(body);
});

export default app;
