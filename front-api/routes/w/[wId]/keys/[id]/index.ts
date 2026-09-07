import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  MAX_API_KEY_SPEND_LIMIT_AWU_CREDITS,
  MIN_API_KEY_SPEND_LIMIT_AWU_CREDITS,
  setApiKeySpendLimit,
} from "@app/lib/api/keys/spend_limit";
import { invalidateKeyCapCache } from "@app/lib/api/programmatic_usage/key_cap";
import { KeyResource } from "@app/lib/resources/key_resource";
import type { ApiKeySpendLimit } from "@app/types/api/keys/spend_limit";
import type { KeyType } from "@app/types/key";
import { assertNever } from "@app/types/shared/utils/assert_never";
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

// Both fields are optional for backward compatibility: legacy plans send
// `monthly_cap_micro_usd`; credit-priced plans send `monthly_cap_awu_credits`
// (null = unlimited).
const PatchKeyBodySchema = z.object({
  monthly_cap_micro_usd: z.number().nullable().optional(),
  monthly_cap_awu_credits: z.number().nullable().optional(),
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
    const user = auth.getNonNullableUser();
    const owner = auth.getNonNullableWorkspace();

    const { id } = ctx.req.valid("param");
    const { monthly_cap_micro_usd, monthly_cap_awu_credits } =
      ctx.req.valid("json");

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

    // Credit-priced per-key spend limit (AWU credits).
    if (monthly_cap_awu_credits !== undefined) {
      if (
        monthly_cap_awu_credits !== null &&
        (monthly_cap_awu_credits < MIN_API_KEY_SPEND_LIMIT_AWU_CREDITS ||
          monthly_cap_awu_credits > MAX_API_KEY_SPEND_LIMIT_AWU_CREDITS)
      ) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              `monthly_cap_awu_credits must be between ` +
              `${MIN_API_KEY_SPEND_LIMIT_AWU_CREDITS} and ` +
              `${MAX_API_KEY_SPEND_LIMIT_AWU_CREDITS}, or null for unlimited.`,
          },
        });
      }

      const previousCapAwuCredits = key.monthlyCapAwuCredits;
      const limit: ApiKeySpendLimit =
        monthly_cap_awu_credits === null
          ? { kind: "unlimited" }
          : { kind: "limited", awuCredits: monthly_cap_awu_credits };

      const result = await setApiKeySpendLimit(auth, {
        keyModelId: key.id,
        limit,
      });
      if (result.isErr()) {
        switch (result.error.type) {
          case "key_not_found":
            return apiError(ctx, {
              status_code: 404,
              api_error: {
                type: "key_not_found",
                message: result.error.message,
              },
            });
          case "system_key":
          case "workspace_not_credit_priced":
          case "workspace_not_metronome_billed":
            return apiError(ctx, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: result.error.message,
              },
            });
          case "metronome_error":
            return apiError(ctx, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: result.error.message,
              },
            });
          default:
            assertNever(result.error.type);
        }
      }

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
          previous_spending_cap_awu_credits: String(
            previousCapAwuCredits ?? "none"
          ),
          new_spending_cap_awu_credits: String(
            monthly_cap_awu_credits ?? "none"
          ),
        },
      });

      // Re-read so the response reflects the persisted cap (setApiKeySpendLimit
      // updates its own resource instance).
      const updated = await KeyResource.fetchByWorkspaceAndId({
        workspace: owner,
        id,
      });
      return ctx.json({
        key: await (updated ?? key).toJSONWithSpaces(auth, user.id),
      });
    }

    // Legacy USD monthly cap.
    if (monthly_cap_micro_usd === undefined) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Provide monthly_cap_micro_usd or monthly_cap_awu_credits to update.",
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
      key: await key.toJSONWithSpaces(auth, user.id),
    });
  }
);

export default app;
