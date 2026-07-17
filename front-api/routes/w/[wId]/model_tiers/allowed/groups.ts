import { ModelsTierResource } from "@app/lib/resources/models_tier_resource";
import type { GetGroupAllowedModelTiersResponseBody } from "@app/types/api/model_tiers";
import {
  GroupAllowedModelTierBodySchema,
  GroupAllowedModelTierClearBodySchema,
} from "@app/types/api/model_tiers";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { modelTierErrorToApiError } from "../errors";

// Mounted at /api/w/:wId/model_tiers/allowed/groups.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetGroupAllowedModelTiersResponseBody> => {
    const auth = ctx.get("auth");

    const groups = await ModelsTierResource.listGroupAllowedTierNames(auth);

    return ctx.json({ groups });
  }
);

/** @ignoreswagger */
app.post(
  "/",
  ensureIsAdmin(),
  validate("json", GroupAllowedModelTierBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const result = await ModelsTierResource.setGroupMaxAllowedTier(auth, body);

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
  validate("json", GroupAllowedModelTierClearBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const result = await ModelsTierResource.clearGroupMaxAllowedTier(
      auth,
      body
    );

    if (result.isErr()) {
      return apiError(ctx, modelTierErrorToApiError(result.error));
    }

    return ctx.body(null, 204);
  }
);

export default app;
