import { AdvancedModelResource } from "@app/lib/resources/advanced_model_resource";
import type { GetUserAllowedAdvancedModelsResponseBody } from "@app/types/api/advanced_models";
import { UserAllowedAdvancedModelBodySchema } from "@app/types/api/advanced_models";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

import { advancedModelErrorToApiError } from "../errors";

// Mounted at /api/w/:wId/advanced_models/allowed/users.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetUserAllowedAdvancedModelsResponseBody> => {
    const auth = ctx.get("auth");

    const users =
      await AdvancedModelResource.listUserAllowedAdvancedModels(auth);

    return ctx.json({ users });
  }
);

/** @ignoreswagger */
app.post(
  "/",
  ensureIsAdmin(),
  validate("json", UserAllowedAdvancedModelBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const result = await AdvancedModelResource.addUserAllowedAdvancedModel(
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
  validate("json", UserAllowedAdvancedModelBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const result = await AdvancedModelResource.removeUserAllowedAdvancedModel(
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
