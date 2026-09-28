import { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import type { GetSuggestionBatchesResponseBody } from "@app/types/api/assistant/suggestion_batches";
import { GetSuggestionBatchesQuerySchema } from "@app/types/api/assistant/suggestion_batches";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";

import batch from "./[bId]";

// Mounted at /api/w/:wId/assistant/suggestion_batches.
const app = workspaceApp();

app.use(
  "*",
  withFeatureFlag("conversational_building", {
    message: "Conversational building is disabled for this workspace.",
  })
);

/** @ignoreswagger */
app.get(
  "/",
  validate("query", GetSuggestionBatchesQuerySchema),
  async (ctx): HandlerResult<GetSuggestionBatchesResponseBody> => {
    const auth = ctx.get("auth");
    const { ids } = ctx.req.valid("query");

    const batches = await BatchSuggestionResource.fetchByIds(auth, ids);

    return ctx.json({
      batches: batches.map((b) => b.toJSONWithSuggestions()),
    });
  }
);

app.route("/:bId", batch);

export default app;
