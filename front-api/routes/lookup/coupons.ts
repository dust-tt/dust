import config from "@app/lib/api/config";
import { getBearerToken } from "@app/lib/auth";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import type { CouponType } from "@app/types/coupon";
import { createHono } from "@front-api/lib/hono";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

// `expirationDate` and `archivedAt` are `Date | null` in CouponType but
// JSON-serialize to ISO strings on the wire.
type CouponWireShape = Omit<CouponType, "expirationDate" | "archivedAt"> & {
  expirationDate: string | null;
  archivedAt: string | null;
};

export type SyncCouponResponseBody = { coupon: CouponWireShape };

// Mounted at /api/lookup/coupons. Uses the REGION_RESOLVER_SECRET Bearer-token
// auth — same as all other /api/lookup/* endpoints. No session required
// (server-to-server call).
const app = createHono();

/** @ignoreswagger */
app.post("/sync", async (ctx): HandlerResult<SyncCouponResponseBody> => {
  const bearerTokenRes = await getBearerToken(ctx.req.header("authorization"));
  if (bearerTokenRes.isErr()) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "The request does not have valid authentication credentials",
      },
    });
  }

  if (bearerTokenRes.value !== config.getRegionResolverSecret()) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "invalid_basic_authorization_error",
        message: "Invalid token",
      },
    });
  }

  const body: CouponType = await ctx.req.json();

  const result = await CouponResource.upsertById(body);
  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to sync coupon: ${result.error.message}`,
      },
    });
  }

  return ctx.json({ coupon: result.value.toJSON() }, 200);
});

export default app;
