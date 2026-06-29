import { ModelTierResource } from "@app/lib/resources/model_tier_resource";
import type {
  ClearModelTierResponseBody,
  GetModelTierResponseBody,
  SetModelTierResponseBody,
} from "@app/types/api/model_tiers";
import { ModelTierSchema } from "@app/types/api/model_tiers";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import groupTier from "./groups/[groupId]";
import groups from "./groups/index";
import memberTier from "./members/[uId]";
import members from "./members/index";

const SetModelTierBodySchema = z.object({
  tier: ModelTierSchema,
});

// Mounted at /api/w/:wId/model_tiers.
const app = workspaceApp();

app.route("/members", members);
app.route("/members/:uId", memberTier);
app.route("/groups", groups);
app.route("/groups/:groupId", groupTier);

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetModelTierResponseBody> => {
    const auth = ctx.get("auth");
    const tier = await ModelTierResource.getWorkspaceTier(auth);
    return ctx.json({ tier });
  }
);

/** @ignoreswagger */
app.put(
  "/",
  ensureIsAdmin(),
  validate("json", SetModelTierBodySchema),
  async (ctx): HandlerResult<SetModelTierResponseBody> => {
    const auth = ctx.get("auth");
    const { tier } = ctx.req.valid("json");

    const result = await ModelTierResource.setWorkspaceTier(auth, { tier });
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json({ tier });
  }
);

/** @ignoreswagger */
app.delete(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<ClearModelTierResponseBody> => {
    const auth = ctx.get("auth");

    const result = await ModelTierResource.clearWorkspaceTier(auth);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json({ cleared: result.value });
  }
);

export default app;
