import { getModelsForAuth } from "@app/lib/advanced_models/enabled_models";
import type { GetEnabledModelsResponseType } from "@app/types/api/assistant/models";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/models.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetEnabledModelsResponseType> => {
  const auth = ctx.get("auth");

  return ctx.json(await getModelsForAuth(auth));
});

export default app;
