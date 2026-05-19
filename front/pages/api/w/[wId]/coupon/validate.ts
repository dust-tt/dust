// @migration-status: MIGRATED_TO_HONO

/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import { apiError } from "@app/logger/withlogging";
import type { CouponType } from "@app/types/coupon";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetCouponValidateResponseBody = {
  coupon: CouponType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetCouponValidateResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported.",
      },
    });
  }

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
  }

  const { code } = req.query;
  if (!isString(code)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid `code` query parameter.",
      },
    });
  }

  const coupon = await CouponResource.findByCode(code);
  if (!coupon) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "coupon_not_found",
        message: "Coupon not found.",
      },
    });
  }

  const validationResult = coupon.validateRedemption();
  if (validationResult.isErr()) {
    const { code: errorCode } = validationResult.error;
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "coupon_not_redeemable",
        message: `Coupon is not redeemable: ${errorCode}.`,
      },
    });
  }

  const existingRedemption =
    await CouponRedemptionResource.findActiveOrPendingByCouponAndWorkspace(
      auth,
      { coupon }
    );
  if (existingRedemption) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "coupon_already_redeemed",
        message: "This coupon has already been redeemed by this workspace.",
      },
    });
  }

  return res.status(200).json({ coupon: coupon.toJSON() });
}

export default withSessionAuthenticationForWorkspace(handler, {
  doesNotRequireCanUseProduct: true,
});
