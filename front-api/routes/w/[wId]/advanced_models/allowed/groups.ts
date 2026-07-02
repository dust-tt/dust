import { AdvancedModelResource } from "@app/lib/resources/advanced_model_resource";
import type { GetGroupAllowedAdvancedModelsResponseBody } from "@app/types/api/advanced_models";
import { GroupAllowedAdvancedModelBodySchema } from "@app/types/api/advanced_models";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { advancedModelErrorToApiError } from "../errors";

// Mounted at /api/w/:wId/advanced_models/allowed/groups.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetGroupAllowedAdvancedModelsResponseBody> => {
    const auth = ctx.get("auth");

    const groups =
      await AdvancedModelResource.listGroupAllowedAdvancedModels(auth);

    return ctx.json({ groups });
  }
);

/** @ignoreswagger */
app.post(
  "/",
  ensureIsAdmin(),
  validate("json", GroupAllowedAdvancedModelBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const result = await AdvancedModelResource.addGroupAllowedAdvancedModel(
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
  validate("json", GroupAllowedAdvancedModelBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const result = await AdvancedModelResource.removeGroupAllowedAdvancedModel(
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
