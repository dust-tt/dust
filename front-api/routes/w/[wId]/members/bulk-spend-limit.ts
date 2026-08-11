import {
  BulkMemberSelectionSchema,
  resolveBulkMemberSelectionUserIds,
} from "@app/lib/api/users/bulk_member_selection";
import {
  MAX_USER_SPEND_LIMIT_AWU_CREDITS,
  MIN_USER_SPEND_LIMIT_AWU_CREDITS,
} from "@app/lib/api/users/spend_limit";
import { runBulkSetUserSpendLimitWorkflow } from "@app/temporal/bulk_spend_limit/client";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const LimitSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("default") }),
  z.object({ kind: z.literal("unlimited") }),
  z.object({
    kind: z.literal("limited"),
    awuCredits: z
      .number()
      .int()
      .min(MIN_USER_SPEND_LIMIT_AWU_CREDITS)
      .max(MAX_USER_SPEND_LIMIT_AWU_CREDITS),
  }),
]);

const BodySchema = z.object({
  selection: BulkMemberSelectionSchema,
  limit: LimitSchema,
});

export type BulkSetUserSpendLimitResponseBody = {
  workflowId: string;
  memberCount: number;
};

// Mounted at /api/w/:wId/members/bulk-spend-limit.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  ensureIsManager(),
  validate("json", BodySchema),
  async (ctx): HandlerResult<BulkSetUserSpendLimitResponseBody> => {
    const auth = ctx.get("auth");

    if (!auth.getNonNullableSubscriptionResource().isMetronomeOnlyBilled) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "plan_limit_error",
          message:
            "Per-user spend limits are only available on Metronome-billed workspaces.",
        },
      });
    }

    const { selection, limit } = ctx.req.valid("json");

    const userIdsResult = await resolveBulkMemberSelectionUserIds(
      auth,
      selection
    );
    if (userIdsResult.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to resolve the selected members.",
        },
      });
    }
    const userIds = userIdsResult.value;
    if (userIds.length === 0) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "No active members matched the selection.",
        },
      });
    }

    const result = await runBulkSetUserSpendLimitWorkflow({
      workspaceId: auth.getNonNullableWorkspace().sId,
      actorUserId: auth.getNonNullableUser().sId,
      userIds,
      limit,
    });
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to start the bulk spend-limit update.",
        },
      });
    }

    return ctx.json({
      workflowId: result.value.workflowId,
      memberCount: userIds.length,
    });
  }
);

export default app;
