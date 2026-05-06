import { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import { CouponFactory } from "@app/tests/utils/CouponFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { describe, expect, it } from "vitest";

import handler from "./validate";

describe("GET /api/w/[wId]/coupon/validate", () => {
  it("returns 400 when code query param is missing", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 404 for unknown coupon code", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    req.query = { ...req.query, code: "UNKNOWN_CODE" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("coupon_not_found");
  });

  it("returns 200 and coupon for a valid code", async () => {
    const coupon = await CouponFactory.create({ code: "VALID10" });
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    req.query = { ...req.query, code: coupon.code };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.coupon.code).toBe("VALID10");
    expect(data.coupon.amount).toBeDefined();
  });

  it("returns 400 for an expired coupon", async () => {
    const expired = await CouponFactory.create({
      expirationDate: new Date("2020-01-01"),
    });
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    req.query = { ...req.query, code: expired.code };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("coupon_not_redeemable");
  });

  it("returns 400 for an exhausted coupon", async () => {
    const exhausted = await CouponFactory.create({
      maxRedemptions: 1,
      redemptionCount: 1,
    });
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    req.query = { ...req.query, code: exhausted.code };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("coupon_not_redeemable");
  });

  it("returns 400 for an archived coupon", async () => {
    const archived = await CouponFactory.create({
      archivedAt: new Date("2023-01-01"),
    });
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    req.query = { ...req.query, code: archived.code };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("coupon_not_redeemable");
  });

  it("returns 400 when coupon already redeemed by this workspace", async () => {
    const coupon = await CouponFactory.create({ code: "ALREADYUSED" });
    const { req, res, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    await CouponRedemptionResource.makeNew(auth, { coupon });

    req.query = { ...req.query, code: coupon.code };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("coupon_already_redeemed");
  });

  it("returns 405 for non-GET methods", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.query = { ...req.query, code: "ANYCODE" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});
