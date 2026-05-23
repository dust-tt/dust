import type { AwuPurchaseInfo } from "@app/lib/credits/awu_purchase";
import {
  getAwuPurchaseInfo,
  purchaseAwuCredits,
} from "@app/lib/credits/awu_purchase";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type GetAwuPurchaseInfoResponseBody = AwuPurchaseInfo;

const PostAwuPurchaseBody = z.object({
  amountCredits: z.number().int().positive(),
});

export type PostAwuPurchaseResponseBody = {
  amountCredits: number;
};

// Mounted at /api/w/:wId/subscriptions/awu-purchase.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetAwuPurchaseInfoResponseBody> => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can purchase AWU credits.",
      },
    });
  }

  try {
    const info = await getAwuPurchaseInfo(auth);
    return ctx.json(info);
  } catch (err) {
    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        error: normalizeError(err),
      },
      "[AWU Purchase] Failed to get purchase info"
    );
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to get AWU purchase info.",
      },
    });
  }
});

app.post(
  "/",
  validate("json", PostAwuPurchaseBody),
  async (ctx): HandlerResult<PostAwuPurchaseResponseBody> => {
    const auth = ctx.get("auth");

    if (!auth.isAdmin()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            "Only users that are `admins` for the current workspace can purchase AWU credits.",
        },
      });
    }

    const { amountCredits } = ctx.req.valid("json");

    const result = await purchaseAwuCredits(auth, { amountCredits });

    if (result.isErr()) {
      const err = result.error;
      switch (err.code) {
        case "not_metronome_billed":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "AWU credit purchases are only available for Metronome-billed workspaces.",
            },
          });
        case "legacy_plan":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "AWU credit purchases are not available for legacy plan workspaces.",
            },
          });
        case "no_stripe_customer":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "No Stripe customer found for this workspace. Please contact support.",
            },
          });
        case "pending_purchase":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "A pending AWU credit purchase already exists for this workspace. Please wait for it to complete.",
            },
          });
        case "invalid_amount":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: err.message,
            },
          });
        case "purchase_failed":
          logger.error(
            {
              workspaceId: auth.getNonNullableWorkspace().sId,
              amountCredits,
              error: err.message,
            },
            "[AWU Purchase] Purchase failed"
          );
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: err.message,
            },
          });
        default:
          assertNever(err);
      }
    }

    return ctx.json(result.value);
  }
);

export default app;
