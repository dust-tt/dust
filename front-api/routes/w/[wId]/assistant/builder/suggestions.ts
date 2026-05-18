import { Hono } from "hono";

import { getBuilderSuggestions } from "@app/lib/api/assistant/suggestions";
import { InternalPostBuilderSuggestionsRequestBodySchema } from "@app/types/api/internal/assistant";

import { validate } from "@front-api/middleware/validator";

// Mounted at /api/w/:wId/assistant/builder/suggestions.
const app = new Hono();

app.post(
  "/",
  validate("json", InternalPostBuilderSuggestionsRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const { type, inputs } = c.req.valid("json");

    const suggestionsRes = await getBuilderSuggestions(auth, type, inputs);
    if (suggestionsRes.isErr()) {
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: suggestionsRes.error.message,
          },
        },
        500
      );
    }

    return c.json(suggestionsRes.value);
  }
);

export default app;
