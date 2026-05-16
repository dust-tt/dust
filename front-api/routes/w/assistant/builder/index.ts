import { Hono } from "hono";

import { getBuilderSuggestions } from "@app/lib/api/assistant/suggestions";
import { InternalPostBuilderSuggestionsRequestBodySchema } from "@app/types/api/internal/assistant";

import { validate } from "../../../../middleware/validator";
import { processApp } from "./process";
import { sidekickApp } from "./sidekick";
import { slackApp } from "./slack";

// Mounted under /api/w/:wId/assistant/builder.

export const builderApp = new Hono();

builderApp.post(
  "/suggestions",
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

builderApp.route("/process", processApp);
builderApp.route("/sidekick", sidekickApp);
builderApp.route("/slack", slackApp);
