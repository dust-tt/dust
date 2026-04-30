/** @ignoreswagger */
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import { apiError } from "@app/logger/withlogging";
import type { CouponType } from "@app/types/coupon";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type ArchivePokeCouponResponseBody = {
  coupon: CouponType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ArchivePokeCouponResponseBody>>,
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

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
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

  if (coupon.archivedAt !== null) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Coupon is already archived.",
      },
    });
  }

  const result = await coupon.archive(auth);
  if (result.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to archive coupon: ${result.error.message}`,
      },
    });
  }

  res.status(200).json({ coupon: coupon.toJSON() });
}

export default withSessionAuthenticationForPoke(handler);
