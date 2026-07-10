import { ModelsTierResource } from "@app/lib/resources/models_tier_resource";
import type { GetUserAllowedModelTiersResponseBody } from "@app/types/api/model_tiers";
import {
  UserAllowedModelTierBodySchema,
  UserAllowedModelTierClearBodySchema,
} from "@app/types/api/model_tiers";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

import { modelTierErrorToApiError } from "../errors";

// Mounted at /api/w/:wId/model_tiers/allowed/users.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetUserAllowedModelTiersResponseBody> => {
    const auth = ctx.get("auth");

    const users = await ModelsTierResource.listUserAllowedTierNames(auth);

    return ctx.json({ users });
  }
);

/** @ignoreswagger */
app.post(
  "/",
  ensureIsAdmin(),
  validate("json", UserAllowedModelTierBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const result = await ModelsTierResource.setUserMaxAllowedTier(auth, body);

    if (result.isErr()) {
      return apiError(ctx, modelTierErrorToApiError(result.error));
    }

    return ctx.body(null, 201);
  }
);

/** @ignoreswagger */
app.delete(
  "/",
  ensureIsAdmin(),
  validate("json", UserAllowedModelTierClearBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const result = await ModelsTierResource.clearUserMaxAllowedTier(auth, body);

    if (result.isErr()) {
      return apiError(ctx, modelTierErrorToApiError(result.error));
    }

    return ctx.body(null, 204);
  }
);

export default app;
