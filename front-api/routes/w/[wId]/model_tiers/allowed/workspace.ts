import { ModelsTierResource } from "@app/lib/resources/models_tier_resource";
import type { GetWorkspaceAllowedModelTiersResponseBody } from "@app/types/api/model_tiers";
import { AllowedModelTierBodySchema } from "@app/types/api/model_tiers";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { modelTierErrorToApiError } from "../errors";

// Mounted at /api/w/:wId/model_tiers/allowed/workspace.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetWorkspaceAllowedModelTiersResponseBody> => {
    const auth = ctx.get("auth");

    const maxTierName =
      await ModelsTierResource.listWorkspaceMaxAllowedTierName(auth);

    return ctx.json({ maxTierName });
  }
);

/** @ignoreswagger */
app.post(
  "/",
  ensureIsAdmin(),
  validate("json", AllowedModelTierBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const result = await ModelsTierResource.setWorkspaceMaxAllowedTierName(
      auth,
      body.tierName
    );

    if (result.isErr()) {
      return apiError(ctx, modelTierErrorToApiError(result.error));
    }

    return ctx.body(null, 201);
  }
);

export default app;
