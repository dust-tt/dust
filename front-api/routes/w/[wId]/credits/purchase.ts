import type {
  CreateCreditPurchaseError,
  CreatedCreditPurchase,
  CreditPurchaseInfo,
  CreditPurchaseInfoError,
} from "@app/lib/api/credits/purchase";
import {
  createCreditPurchase,
  getCreditPurchaseInfo,
} from "@app/lib/api/credits/purchase";
import type { APIErrorWithStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export const PostCreditPurchaseRequestBody = z.object({
  amountDollars: z.number().positive(),
});

type PostCreditPurchaseResponseBody = CreatedCreditPurchase & {
  success: true;
};

export type GetCreditPurchaseInfoResponseBody = CreditPurchaseInfo;

function infoErrorToApi(err: CreditPurchaseInfoError): APIErrorWithStatusCode {
  switch (err.type) {
    case "subscription_not_found":
      return {
        status_code: 400,
        api_error: {
          type: "subscription_not_found",
          message:
            "No active subscription found. Please subscribe to a plan first.",
        },
      };
    case "internal":
      return {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to resolve billing currency for this workspace.",
        },
      };
    default:
      assertNever(err.type);
  }
}

function purchaseErrorToApi(
  err: CreateCreditPurchaseError
): APIErrorWithStatusCode {
  switch (err.type) {
    case "subscription_not_found":
      return {
        status_code: 400,
        api_error: {
          type: "subscription_not_found",
          message: "[Credit Purchase] Stripe subscription not found.",
        },
      };
    case "purchase_not_allowed":
      return {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            err.details.reason === "trialing"
              ? "Credit purchases are not available during trial. Please contact support."
              : "Credit purchases require an active subscription. Please ensure your payment method is up to date.",
        },
      };
    case "amount_exceeds_limit": {
      const maxDollars = (err.details.maxAmountMicroUsd ?? 0) / 1_000_000;
      return {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Amount exceeds maximum allowed: $${maxDollars}. Please contact support for higher limits.`,
        },
      };
    }
    case "internal":
      return {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to process credit purchase.",
        },
      };
    default:
      assertNever(err.type);
  }
}

// Mounted at /api/w/:wId/credits/purchase.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetCreditPurchaseInfoResponseBody> => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access credit purchases.",
      },
    });
  }

  const infoRes = await getCreditPurchaseInfo(auth);
  if (infoRes.isErr()) {
    return apiError(ctx, infoErrorToApi(infoRes.error));
  }
  return ctx.json(infoRes.value);
});

app.post(
  "/",
  validate("json", PostCreditPurchaseRequestBody),
  async (ctx): HandlerResult<PostCreditPurchaseResponseBody> => {
    const auth = ctx.get("auth");

    if (!auth.isAdmin()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            "Only users that are `admins` for the current workspace can access credit purchases.",
        },
      });
    }

    const body = ctx.req.valid("json");

    const purchaseRes = await createCreditPurchase(auth, body);
    if (purchaseRes.isErr()) {
      return apiError(ctx, purchaseErrorToApi(purchaseRes.error));
    }

    return ctx.json({ success: true as const, ...purchaseRes.value });
  }
);

export default app;
