import { pushCouponToOtherRegion } from "@app/lib/api/poke/coupons";
import { config } from "@app/lib/api/regions/config";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import { CouponFactory } from "@app/tests/utils/CouponFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/regions/config", async (importActual) => {
  const mod =
    await importActual<typeof import("@app/lib/api/regions/config")>();
  return {
    ...mod,
    config: { ...mod.config, isMainRegion: vi.fn() },
  };
});

vi.mock("@app/lib/api/poke/coupons", () => ({
  pushCouponToOtherRegion: vi.fn(),
}));

const VALID_BODY = {
  code: "TESTCODE",
  description: null,
  discountType: "seat",
  amount: 10,
  durationMonths: null,
  maxRedemptions: null,
  expirationDate: null,
};

function postCoupon(body: object) {
  return honoApp.request("/api/poke/coupons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/poke/coupons", { sequential: true }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(config.isMainRegion).mockReturnValue(true);
    vi.mocked(pushCouponToOtherRegion).mockResolvedValue(new Ok(undefined));
  });

  it("returns 401 when the user is not a super user", async () => {
    await createPrivateApiMockRequest({ isSuperUser: false });

    const response = await postCoupon(VALID_BODY);

    expect(response.status).toBe(401);
  });

  it("returns 400 when called from a non-main region (EU)", async () => {
    vi.mocked(config.isMainRegion).mockReturnValue(false);
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await postCoupon(VALID_BODY);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
    expect(pushCouponToOtherRegion).not.toHaveBeenCalled();
  });

  it("returns 400 when a coupon with the same code already exists", async () => {
    await CouponFactory.create({ code: VALID_BODY.code });
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await postCoupon(VALID_BODY);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        type: "invalid_request_error",
        message: expect.stringContaining("already exists"),
      },
    });
  });

  it("creates coupon, pushes to other region, and returns 201", async () => {
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await postCoupon({ ...VALID_BODY, code: "NEWCODE" });

    expect(response.status).toBe(201);
    const { coupon } = await response.json();
    expect(coupon.code).toBe("NEWCODE");
    expect(pushCouponToOtherRegion).toHaveBeenCalledOnce();
    expect(pushCouponToOtherRegion).toHaveBeenCalledWith(
      expect.objectContaining({ code: "NEWCODE" })
    );
  });

  it("deletes the coupon and returns 500 when the push to other region fails", async () => {
    vi.mocked(pushCouponToOtherRegion).mockResolvedValue(
      new Err("other_region_push_failed")
    );
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await postCoupon({ ...VALID_BODY, code: "FAILCODE" });

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { type: "internal_server_error" },
    });
    const coupon = await CouponResource.findByCode("FAILCODE");
    expect(coupon).toBeNull();
  });
});

describe("pushCouponToOtherRegion — dev vs prod", { sequential: true }, () => {
  // The module is mocked at the file level for the handler tests above, so we
  // need importActual to get the real implementation here.
  let realPushCouponToOtherRegion: typeof pushCouponToOtherRegion;
  const mockFetch = vi.fn();

  beforeAll(async () => {
    const mod = await vi.importActual<
      typeof import("@app/lib/api/poke/coupons")
    >("@app/lib/api/poke/coupons");
    realPushCouponToOtherRegion = mod.pushCouponToOtherRegion;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  it("skips the fetch in development (isDevelopment=true)", async () => {
    const envModule = await vi.importActual<
      typeof import("@app/types/shared/env")
    >("@app/types/shared/env");
    const spy = vi.spyOn(envModule, "isDevelopment").mockReturnValue(true);

    const coupon = await CouponFactory.create();
    const result = await realPushCouponToOtherRegion(coupon.toJSON());

    spy.mockRestore();

    expect(result.isOk()).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
