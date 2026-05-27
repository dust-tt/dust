import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { KeyType } from "@app/types/key";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import keyId from "./[id]";

const MAX_API_KEY_CREATION_PER_DAY = 30;

export type GetKeysResponseBody = {
  keys: KeyType[];
};

export type PostKeysResponseBody = {
  key: KeyType;
};

const CreateKeyPostBodySchema = z.object({
  name: z.string(),
  group_id: z.string().optional(),
  group_ids: z.array(z.string()).optional(),
  monthly_cap_micro_usd: z.number().nullish(),
  role: z.enum(["user", "builder", "admin"]).optional(),
});

// Mounted at /api/w/:wId/keys.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetKeysResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const keys = await KeyResource.listNonSystemKeysByWorkspace(owner);

    return ctx.json({
      keys: keys.map((k) => k.toJSON()),
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

    const { name, group_id, group_ids, monthly_cap_micro_usd, role } =
      ctx.req.valid("json");
    const trimmedName = name.trim();
    const keyRole = role ?? "builder";

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

    return ctx.json(
      {
        key: key.toJSON(),
      },
      201
    );
  }
);

app.route("/:id", keyId);

export default app;
