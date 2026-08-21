import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  clearUserMaxAllowedTier,
  listUserAllowedTierNames,
  setUserMaxAllowedTier,
} from "@app/lib/model_tiers/allowed_tiers";
import { UserResource } from "@app/lib/resources/user_resource";
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

    const users = await listUserAllowedTierNames(auth);

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

    const result = await setUserMaxAllowedTier(auth, body);

    if (result.isErr()) {
      return apiError(ctx, modelTierErrorToApiError(result.error));
    }

    const user = await UserResource.fetchById(body.userId);
    void emitAuditLogEvent({
      auth,
      action: "user.advanced_model_access_updated",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("user", {
          sId: body.userId,
          name: user?.fullName() || body.userId,
        }),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        enabled: String(true),
        model_id: body.tierName,
        provider_id: "model_tier",
      },
    });

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

    const result = await clearUserMaxAllowedTier(auth, body);

    if (result.isErr()) {
      return apiError(ctx, modelTierErrorToApiError(result.error));
    }

    const user = await UserResource.fetchById(body.userId);
    void emitAuditLogEvent({
      auth,
      action: "user.advanced_model_access_updated",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("user", {
          sId: body.userId,
          name: user?.fullName() || body.userId,
        }),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        enabled: String(false),
        model_id: "inherit",
        provider_id: "model_tier",
      },
    });

    return ctx.body(null, 204);
  }
);

export default app;
