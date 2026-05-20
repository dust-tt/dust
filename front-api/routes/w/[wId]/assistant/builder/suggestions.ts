import { getBuilderSuggestions } from "@app/lib/api/assistant/suggestions";
import { InternalPostBuilderSuggestionsRequestBodySchema } from "@app/types/api/internal/assistant";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";

// Mounted at /api/w/:wId/assistant/builder/suggestions.
const app = new Hono();

app.post(
  "/",
  validate("json", InternalPostBuilderSuggestionsRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { type, inputs } = ctx.req.valid("json");

    const suggestionsRes = await getBuilderSuggestions(auth, type, inputs);
    if (suggestionsRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: suggestionsRes.error.message,
        },
      });
    }

    return ctx.json(suggestionsRes.value);
  }
);

export default app;
