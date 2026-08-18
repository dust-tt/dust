import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  listWorkspaceMaxAllowedTierName,
  setWorkspaceMaxAllowedTierName,
} from "@app/lib/model_tiers/allowed_tiers";
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

    const maxTierName = await listWorkspaceMaxAllowedTierName(auth);

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

    const result = await setWorkspaceMaxAllowedTierName(auth, body.tierName);

    if (result.isErr()) {
      return apiError(ctx, modelTierErrorToApiError(result.error));
    }

    void emitAuditLogEvent({
      auth,
      action: "workspace.advanced_model_access_updated",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
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

export default app;
