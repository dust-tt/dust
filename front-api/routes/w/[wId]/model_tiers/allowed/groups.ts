import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  clearGroupMaxAllowedTier,
  listGroupAllowedTierNames,
  setGroupMaxAllowedTier,
} from "@app/lib/model_tiers/allowed_tiers";
import { GroupResource } from "@app/lib/resources/group_resource";
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

    const groups = await listGroupAllowedTierNames(auth);

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

    const result = await setGroupMaxAllowedTier(auth, body);

    if (result.isErr()) {
      return apiError(ctx, modelTierErrorToApiError(result.error));
    }

    const groupRes = await GroupResource.fetchById(auth, body.groupId);
    const group = groupRes.isOk()
      ? groupRes.value
      : { sId: body.groupId, name: body.groupId };
    void emitAuditLogEvent({
      auth,
      action: "group.advanced_model_access_updated",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("group", group),
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
  validate("json", GroupAllowedModelTierClearBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const result = await clearGroupMaxAllowedTier(auth, body);

    if (result.isErr()) {
      return apiError(ctx, modelTierErrorToApiError(result.error));
    }

    const groupRes = await GroupResource.fetchById(auth, body.groupId);
    const group = groupRes.isOk()
      ? groupRes.value
      : { sId: body.groupId, name: body.groupId };
    void emitAuditLogEvent({
      auth,
      action: "group.advanced_model_access_updated",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("group", group),
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
