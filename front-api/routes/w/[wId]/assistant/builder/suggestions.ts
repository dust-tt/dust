import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";

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
      return apiError(c, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: suggestionsRes.error.message,
        },
      });
    }

    return c.json(suggestionsRes.value);
  }
);

export default app;
