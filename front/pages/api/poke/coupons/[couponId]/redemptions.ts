/** @ignoreswagger */
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import { apiError } from "@app/logger/withlogging";
import type { CouponRedemptionType } from "@app/types/coupon";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetPokeCouponRedemptionsResponseBody = {
  redemptions: CouponRedemptionType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetPokeCouponRedemptionsResponseBody>
  >,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  const { couponId } = req.query;
  if (!isString(couponId)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "coupon_not_found",
        message: "Could not find the coupon.",
      },
    });
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const coupon = await CouponResource.fetchByCouponId(couponId);
  if (!coupon) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "coupon_not_found",
        message: "Could not find the coupon.",
      },
    });
  }

  const redemptions = await CouponRedemptionResource.listAllByCoupon(coupon);
  res.status(200).json({ redemptions: redemptions.map((r) => r.toJSON()) });
}

export default withSessionAuthenticationForPoke(handler);
