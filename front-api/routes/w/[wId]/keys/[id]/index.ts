import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { invalidateKeyCapCache } from "@app/lib/api/programmatic_usage/key_cap";
import { KeyResource } from "@app/lib/resources/key_resource";
import type { KeyType } from "@app/types/key";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import disable from "./disable";

export type PatchKeyResponseBody = {
  key: KeyType;
};

const KeyIdParamSchema = z.object({
  id: z.string(),
});

const PatchKeyBodySchema = z.object({
  monthly_cap_micro_usd: z.number().nullable(),
});

// Mounted at /api/w/:wId/keys/:id.
const app = workspaceApp();

// Register the static sub-path BEFORE the bare `/` patch so the param-less
// disable route is not swallowed by anything later.
app.route("/disable", disable);

/** @ignoreswagger */
app.patch(
  "/",
  ensureIsAdmin(),
  validate("param", KeyIdParamSchema),
  validate("json", PatchKeyBodySchema),
  async (ctx): HandlerResult<PatchKeyResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const { id } = ctx.req.valid("param");
    const { monthly_cap_micro_usd } = ctx.req.valid("json");

    const key = await KeyResource.fetchByWorkspaceAndId({
      workspace: owner,
      id,
    });

    if (!key) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "key_not_found",
          message: "Could not find the key.",
        },
      });
    }

    if (monthly_cap_micro_usd !== null && monthly_cap_micro_usd < 0) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "monthly_cap_micro_usd must be greater than or equal to 0.",
        },
      });
    }

    const previousCapMicroUsd = key.monthlyCapMicroUsd;

    await key.updateMonthlyCap({
      monthlyCapMicroUsd: monthly_cap_micro_usd,
    });
    await invalidateKeyCapCache({
      workspace: owner,
      keyId: key.id,
    });

    void emitAuditLogEvent({
      auth,
      action: "api_key.updated",
      targets: [
        buildAuditLogTarget("workspace", owner),
        buildAuditLogTarget("api_key", {
          sId: String(key.id),
          name: key.name,
        }),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        previous_spending_cap: String(previousCapMicroUsd ?? "none"),
        new_spending_cap: String(monthly_cap_micro_usd ?? "none"),
      },
    });

    return ctx.json({
      key: key.toJSON(),
    });
  }
);

export default app;
