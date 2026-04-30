/** @ignoreswagger */
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import { apiError } from "@app/logger/withlogging";
import type { CouponType } from "@app/types/coupon";
import { CreateCouponBodySchema } from "@app/types/coupon";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetPokeCouponsResponseBody = {
  coupons: CouponType[];
};

export type CreatePokeCouponResponseBody = {
  coupon: CouponType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetPokeCouponsResponseBody | CreatePokeCouponResponseBody
    >
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

  switch (req.method) {
    case "GET": {
      const coupons = await CouponResource.listAll({ includeArchived: true });
      res.status(200).json({ coupons: coupons.map((c) => c.toJSON()) });
      return;
    }

    case "POST": {
      const bodyResult = CreateCouponBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${bodyResult.error.message}`,
          },
        });
      }

      const existing = await CouponResource.findByCode(bodyResult.data.code);
      if (existing) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "A coupon with this code already exists.",
          },
        });
      }

      const result = await CouponResource.makeNew(auth, bodyResult.data);
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to create coupon: ${result.error.message}`,
          },
        });
      }

      res.status(201).json({ coupon: result.value.toJSON() });
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET or POST expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
