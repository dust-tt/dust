import { AdvancedModelResource } from "@app/lib/resources/advanced_model_resource";
import type { GetWorkspaceAllowedAdvancedModelsResponseBody } from "@app/types/api/advanced_models";
import { AllowedAdvancedModelBodySchema } from "@app/types/api/advanced_models";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { advancedModelErrorToApiError } from "../errors";

// Mounted at /api/w/:wId/advanced_models/allowed/workspace.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetWorkspaceAllowedAdvancedModelsResponseBody> => {
    const auth = ctx.get("auth");

    const models =
      await AdvancedModelResource.listWorkspaceAllowedAdvancedModels(auth);

    return ctx.json({ models });
  }
);

/** @ignoreswagger */
app.post(
  "/",
  ensureIsAdmin(),
  validate("json", AllowedAdvancedModelBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const result = await AdvancedModelResource.addWorkspaceAllowedAdvancedModel(
      auth,
      body
    );

    if (result.isErr()) {
      return apiError(ctx, advancedModelErrorToApiError(result.error));
    }

    return ctx.body(null, 201);
  }
);

/** @ignoreswagger */
app.delete(
  "/",
  ensureIsAdmin(),
  validate("json", AllowedAdvancedModelBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const result =
      await AdvancedModelResource.removeWorkspaceAllowedAdvancedModel(
        auth,
        body
      );

    if (result.isErr()) {
      return apiError(ctx, advancedModelErrorToApiError(result.error));
    }

    return ctx.body(null, 204);
  }
);

export default app;
