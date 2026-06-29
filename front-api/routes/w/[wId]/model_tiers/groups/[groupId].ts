import { GroupResource } from "@app/lib/resources/group_resource";
import { ModelTierResource } from "@app/lib/resources/model_tier_resource";
import type {
  ClearModelTierResponseBody,
  SetModelTierResponseBody,
} from "@app/types/api/model_tiers";
import { ModelTierSchema } from "@app/types/api/model_tiers";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  groupId: z.string(),
});

const SetModelTierBodySchema = z.object({
  tier: ModelTierSchema,
});

// Mounted at /api/w/:wId/model_tiers/groups/:groupId.
const app = workspaceApp();

/** @ignoreswagger */
app.put(
  "/",
  validate("param", ParamsSchema),
  ensureIsAdmin(),
  validate("json", SetModelTierBodySchema),
  async (ctx): HandlerResult<SetModelTierResponseBody> => {
    const auth = ctx.get("auth");
    const { groupId } = ctx.req.valid("param");
    const { tier } = ctx.req.valid("json");

    const groupRes = await GroupResource.fetchById(auth, groupId);
    if (groupRes.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "group_not_found",
          message: "Group not found.",
        },
      });
    }

    const result = await ModelTierResource.setGroupTier(auth, {
      groupId: groupRes.value.id,
      tier,
    });
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
  validate("param", ParamsSchema),
  ensureIsAdmin(),
  async (ctx): HandlerResult<ClearModelTierResponseBody> => {
    const auth = ctx.get("auth");
    const { groupId } = ctx.req.valid("param");

    const groupRes = await GroupResource.fetchById(auth, groupId);
    if (groupRes.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "group_not_found",
          message: "Group not found.",
        },
      });
    }

    const result = await ModelTierResource.clearGroupTier(auth, {
      groupId: groupRes.value.id,
    });
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
