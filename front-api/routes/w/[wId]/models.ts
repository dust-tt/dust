import { withModelSelectability } from "@app/lib/advanced_models/enabled_models";
import { getAvailableModelsForWorkspace } from "@app/lib/api/assistant/workspace_capabilities";
import type { GetEnabledModelsResponseType } from "@app/types/api/assistant/models";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/models.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetEnabledModelsResponseType> => {
  const auth = ctx.get("auth");

  const availableModels = await getAvailableModelsForWorkspace(auth);

  const models = await withModelSelectability(auth, {
    models: availableModels,
  });

  return ctx.json({ models });
});

export default app;
