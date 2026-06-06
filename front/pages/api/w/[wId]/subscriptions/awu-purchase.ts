// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type {
  GetAwuPurchaseInfoResponseBody,
  PostAwuPurchaseResponseBody,
} from "@app/lib/credits/awu_purchase";
import {
  getAwuPurchaseInfo,
  purchaseAwuCredits,
} from "@app/lib/credits/awu_purchase";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const PostAwuPurchaseBody = z.object({
  amountCredits: z.number().int().positive(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      PostAwuPurchaseResponseBody | GetAwuPurchaseInfoResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can purchase AWU credits.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      try {
        const info = await getAwuPurchaseInfo(auth);
        return res.status(200).json(info);
      } catch (err) {
        logger.error(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            error: normalizeError(err),
          },
          "[AWU Purchase] Failed to get purchase info"
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to get AWU purchase info.",
          },
        });
      }
    }

    case "POST": {
      const bodyValidation = PostAwuPurchaseBody.safeParse(req.body);
      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${fromError(bodyValidation.error).toString()}`,
          },
        });
      }

      const { amountCredits } = bodyValidation.data;

      const result = await purchaseAwuCredits(auth, { amountCredits });

      if (result.isErr()) {
        const err = result.error;
        switch (err.code) {
          case "not_metronome_billed":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message:
                  "AWU credit purchases are only available for Metronome-billed workspaces.",
              },
            });
          case "legacy_plan":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message:
                  "AWU credit purchases are not available for legacy plan workspaces.",
              },
            });
          case "enterprise_plan":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message:
                  "AWU credit purchases are not available for Enterprise workspaces. Please contact your Dust sales representative.",
              },
            });
          case "no_stripe_customer":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message:
                  "No Stripe customer found for this workspace. Please contact support.",
              },
            });
          case "pending_purchase":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message:
                  "A pending AWU credit purchase already exists for this workspace. Please wait for it to complete.",
              },
            });
          case "invalid_amount":
            return apiError(req, res, {
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
            return apiError(req, res, {
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

      return res.status(200).json(result.value);
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
