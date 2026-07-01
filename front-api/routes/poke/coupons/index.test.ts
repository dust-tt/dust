import {
  canCreateCoupon,
  createCouponAndPushToOtherRegion,
  type pushCouponToOtherRegion,
} from "@app/lib/api/poke/coupons";
import { CouponFactory } from "@app/tests/utils/CouponFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/poke/coupons", () => ({
  canCreateCoupon: vi.fn(),
  createCouponAndPushToOtherRegion: vi.fn(),
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

const mockCouponJSON = {
  sId: "cou_fake",
  code: "TESTCODE",
  description: null,
  discountType: "seat",
  amount: 10,
  durationMonths: null,
  maxRedemptions: null,
  redemptionCount: 0,
  expirationDate: null,
  archivedAt: null,
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
    vi.mocked(canCreateCoupon).mockReturnValue(true);
    vi.mocked(createCouponAndPushToOtherRegion).mockResolvedValue(
      new Ok({ toJSON: () => ({ ...mockCouponJSON }) } as any)
    );
  });

  it("returns 401 when the user is not a super user", async () => {
    await createPrivateApiMockRequest({ isSuperUser: false });

    const response = await postCoupon(VALID_BODY);

    expect(response.status).toBe(401);
  });

  it("returns 400 when called from a non-main region (EU)", async () => {
    vi.mocked(canCreateCoupon).mockReturnValue(false);
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await postCoupon(VALID_BODY);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
    expect(createCouponAndPushToOtherRegion).not.toHaveBeenCalled();
  });

  it("returns 400 when a coupon with the same code already exists", async () => {
    vi.mocked(createCouponAndPushToOtherRegion).mockResolvedValue(
      new Err({ type: "coupon_already_exists" })
    );
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

  it("calls createCouponAndPushToOtherRegion and returns 201", async () => {
    vi.mocked(createCouponAndPushToOtherRegion).mockResolvedValue(
      new Ok({ toJSON: () => ({ ...mockCouponJSON, code: "NEWCODE" }) } as any)
    );
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await postCoupon({ ...VALID_BODY, code: "NEWCODE" });

    expect(response.status).toBe(201);
    const { coupon } = await response.json();
    expect(coupon.code).toBe("NEWCODE");
    expect(createCouponAndPushToOtherRegion).toHaveBeenCalledOnce();
    expect(createCouponAndPushToOtherRegion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ code: "NEWCODE" })
    );
  });

  it("returns 500 when sync to other region fails", async () => {
    vi.mocked(createCouponAndPushToOtherRegion).mockResolvedValue(
      new Err({ type: "sync_failed" })
    );
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await postCoupon({ ...VALID_BODY, code: "FAILCODE" });

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { type: "internal_server_error" },
    });
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
