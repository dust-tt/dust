import type { BulkSeatChangePreview } from "@app/lib/api/credits/bulk_seat_change";
import {
  BulkSeatChangeTargetSeatTypeSchema,
  computeBulkSeatChangePreview,
} from "@app/lib/api/credits/bulk_seat_change";
import {
  BulkMemberSelectionSchema,
  resolveBulkMemberSelectionUserIds,
} from "@app/lib/api/users/bulk_member_selection";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { runBulkChangeSeatTypeWorkflow } from "@app/temporal/bulk_seat_change/client";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsBusinessAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

const BodySchema = z.object({
  selection: BulkMemberSelectionSchema,
  seatType: BulkSeatChangeTargetSeatTypeSchema,
});

export type BulkChangeSeatTypeResponseBody = {
  workflowId: string;
  memberCount: number;
};

export type BulkSeatChangePreviewResponseBody = {
  preview: BulkSeatChangePreview;
};

// Shared guards for the apply and preview handlers. Returns the error
// response when a guard fails, null when the request may proceed.
async function checkBulkSeatTypeAccess(
  ctx: Context,
  auth: Authenticator
): Promise<ReturnType<typeof apiError> | null> {
  if (!(await hasFeatureFlag(auth, "pricing_groups"))) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "feature_flag_not_found",
        message: "The pricing_groups feature is not enabled.",
      },
    });
  }

  if (!auth.getNonNullableSubscriptionResource().isMetronomeOnlyBilled) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "plan_limit_error",
        message:
          "Seat type management is only available for workspaces on Metronome billing.",
      },
    });
  }

  return null;
}

// Mounted at /api/w/:wId/members/bulk-seat-type.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  ensureIsBusinessAdmin(),
  validate("json", BodySchema),
  async (ctx): HandlerResult<BulkChangeSeatTypeResponseBody> => {
    const auth = ctx.get("auth");

    const accessError = await checkBulkSeatTypeAccess(ctx, auth);
    if (accessError) {
      return accessError;
    }

    const { selection, seatType } = ctx.req.valid("json");

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

    const result = await runBulkChangeSeatTypeWorkflow({
      workspaceId: auth.getNonNullableWorkspace().sId,
      actorUserId: auth.getNonNullableUser().sId,
      userIds,
      seatType,
    });
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to start the bulk seat-type update.",
        },
      });
    }

    return ctx.json({
      workflowId: result.value.workflowId,
      memberCount: userIds.length,
    });
  }
);

/** @ignoreswagger */
app.post(
  "/preview",
  ensureIsBusinessAdmin(),
  validate("json", BodySchema),
  async (ctx): HandlerResult<BulkSeatChangePreviewResponseBody> => {
    const auth = ctx.get("auth");

    const accessError = await checkBulkSeatTypeAccess(ctx, auth);
    if (accessError) {
      return accessError;
    }

    const { selection, seatType } = ctx.req.valid("json");

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

    const previewResult = await computeBulkSeatChangePreview(auth, {
      userIds,
      targetSeatType: seatType,
    });
    if (previewResult.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to compute the seat-change preview.",
        },
      });
    }

    return ctx.json({ preview: previewResult.value });
  }
);

export default app;
