import { AdvancedModelResource } from "@app/lib/resources/advanced_model_resource";
import type { GetAdvancedModelsResponseBody } from "@app/types/api/advanced_models";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

import allowed from "./allowed";

// Mounted at /api/w/:wId/advanced_models.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetAdvancedModelsResponseBody> => {
    const models = AdvancedModelResource.getAdvancedModels().map((model) => ({
      providerId: model.providerId,
      modelId: model.modelId,
      displayName: model.displayName,
    }));

    return ctx.json({ models });
  }
);

app.route("/allowed", allowed);

export default app;
