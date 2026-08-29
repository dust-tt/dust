import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { listKeyScopableGroups } from "@app/lib/api/keys/scopable_groups";
import {
  MAX_API_KEY_SPEND_LIMIT_AWU_CREDITS,
  MIN_API_KEY_SPEND_LIMIT_AWU_CREDITS,
  setApiKeySpendLimit,
} from "@app/lib/api/keys/spend_limit";
import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type {
  GetKeysResponseBody,
  PostKeysResponseBody,
} from "@app/types/api/keys";
import { isCreditPricedPlan } from "@app/types/plan";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import keyId from "./[id]";
import keyGroups from "./groups";

const MAX_API_KEY_CREATION_PER_DAY = 30;

const CreateKeyPostBodySchema = z.object({
  name: z.string(),
  group_id: z.string().optional(),
  group_ids: z.array(z.string()).optional(),
  monthly_cap_micro_usd: z.number().nullish(),
  // Per-key credit cap in AWU credits (credit-priced plans only). null/omitted
  // = unlimited.
  monthly_cap_awu_credits: z.number().nullish(),
  role: z.enum(["user", "admin"]).optional(),
});

// Mounted at /api/w/:wId/keys.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetKeysResponseBody> => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();
    const owner = auth.getNonNullableWorkspace();

    const keys = await KeyResource.listNonSystemKeysByWorkspace(owner);

    return ctx.json({
      keys: keys.map((k) => k.toJSON(user.id)),
    });
  }
);

app.post(
  "/",
  ensureIsAdmin(),
  validate("json", CreateKeyPostBodySchema),
  async (ctx): HandlerResult<PostKeysResponseBody> => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();
    const owner = auth.getNonNullableWorkspace();

    const {
      name,
      group_id,
      group_ids,
      monthly_cap_micro_usd,
      monthly_cap_awu_credits,
      role,
    } = ctx.req.valid("json");
    const trimmedName = name.trim();
    const keyRole = role ?? "user";

    if (trimmedName.length === 0) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "API key name cannot be empty.",
        },
      });
    }

    if (
      monthly_cap_micro_usd !== null &&
      monthly_cap_micro_usd !== undefined &&
      monthly_cap_micro_usd < 0
    ) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "monthly_cap_micro_usd must be greater than or equal to 0",
        },
      });
    }

    // Per-key credit cap: only valid on credit-priced plans and within range.
    // Validated up front so we never create a key whose requested cap can't be
    // applied.
    if (
      monthly_cap_awu_credits !== null &&
      monthly_cap_awu_credits !== undefined
    ) {
      const plan = auth.subscription()?.plan;
      if (!plan || !isCreditPricedPlan(plan)) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Per-key credit spend limits are only available on credit-priced plans.",
          },
        });
      }
      if (
        monthly_cap_awu_credits < MIN_API_KEY_SPEND_LIMIT_AWU_CREDITS ||
        monthly_cap_awu_credits > MAX_API_KEY_SPEND_LIMIT_AWU_CREDITS
      ) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              `monthly_cap_awu_credits must be between ` +
              `${MIN_API_KEY_SPEND_LIMIT_AWU_CREDITS} and ` +
              `${MAX_API_KEY_SPEND_LIMIT_AWU_CREDITS}.`,
          },
        });
      }
    }

    const existingKey = await KeyResource.fetchByName(auth, {
      name: trimmedName,
      onlyActive: true,
    });
    if (existingKey) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "An API key with this name already exists in this workspace.",
        },
      });
    }

    // Resolve groups: prefer group_ids (new), fall back to group_id (retro-compatibility).
    const globalGroupRes = await GroupResource.fetchWorkspaceGlobalGroup(auth);
    if (globalGroupRes.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "group_not_found",
          message: "Global group not found",
        },
      });
    }
    const globalGroup = globalGroupRes.value;

    const resolvedGroups: GroupResource[] = [globalGroup];

    const additionalGroupIds = group_ids
      ? group_ids.filter((gId) => gId !== globalGroup.sId)
      : group_id && group_id !== globalGroup.sId
        ? [group_id]
        : [];

    if (additionalGroupIds.length > 0) {
      // A key can only be scoped to groups of restricted spaces or pods.
      const scopableGroupIds = new Set(
        (await listKeyScopableGroups(auth)).map((group) => group.sId)
      );
      const invalidGroupIds = additionalGroupIds.filter(
        (gId) => !scopableGroupIds.has(gId)
      );
      if (invalidGroupIds.length > 0) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "An API key can only be scoped to groups of restricted spaces or pods.",
          },
        });
      }

      const groupsRes = await GroupResource.fetchByIds(
        auth,
        additionalGroupIds
      );
      if (groupsRes.isErr()) {
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "group_not_found",
            message: "Invalid group",
          },
        });
      }
      resolvedGroups.push(...groupsRes.value);
    }

    const rateLimitKey = `api_key_creation_${owner.sId}`;
    const remaining = await rateLimiter({
      key: rateLimitKey,
      maxPerTimeframe: MAX_API_KEY_CREATION_PER_DAY,
      timeframeSeconds: 24 * 60 * 60, // 1 day
      logger,
    });

    if (remaining === 0) {
      return apiError(ctx, {
        status_code: 429,
        api_error: {
          type: "rate_limit_error",
          message:
            `You have reached the limit of ${MAX_API_KEY_CREATION_PER_DAY} API keys ` +
            "creations per day. Please try again later.",
        },
      });
    }

    const key = await KeyResource.makeNew(
      {
        name: trimmedName,
        status: "active",
        userId: user.id,
        workspaceId: owner.id,
        isSystem: false,
        role: keyRole,
        monthlyCapMicroUsd: monthly_cap_micro_usd ?? null,
      },
      resolvedGroups
    );

    void emitAuditLogEvent({
      auth,
      action: "api_key.created",
      targets: [
        buildAuditLogTarget("workspace", owner),
        buildAuditLogTarget("api_key", {
          sId: String(key.id),
          name: trimmedName,
        }),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        group_ids: resolvedGroups.map((g) => g.sId).join(","),
        role: keyRole,
      },
    });

    // Apply the per-key credit cap (persists the cap, creates the Metronome
    // alert, reconciles state). Validated above, so only a Metronome failure
    // can error here.
    if (
      monthly_cap_awu_credits !== null &&
      monthly_cap_awu_credits !== undefined
    ) {
      const limitResult = await setApiKeySpendLimit(auth, {
        keyModelId: key.id,
        limit: { kind: "limited", awuCredits: monthly_cap_awu_credits },
      });
      if (limitResult.isErr()) {
        logger.error(
          {
            workspaceId: owner.sId,
            keyName: trimmedName,
            err: limitResult.error,
          },
          "[Keys] Failed to apply credit cap on newly created key"
        );
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Key created but failed to set credit cap: ${limitResult.error.message}`,
          },
        });
      }
    }

    const created =
      (await KeyResource.fetchByWorkspaceAndId({
        workspace: owner,
        id: key.id,
      })) ?? key;

    return ctx.json(
      {
        key: created.toJSON(user.id),
      },
      201
    );
  }
);

app.route("/groups", keyGroups);
app.route("/:id", keyId);

export default app;
