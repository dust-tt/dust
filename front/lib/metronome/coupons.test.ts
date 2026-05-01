import { Authenticator } from "@app/lib/auth";
import {
  CREDIT_TYPE_EUR_ID,
  CREDIT_TYPE_USD_ID,
} from "@app/lib/metronome/constants";
import {
  createCouponCredit,
  endCouponCredit,
  getCreditTypeFromContract,
  redeemCoupon,
  revokeCouponRedemption,
} from "@app/lib/metronome/coupons";
import { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import type { CouponResource } from "@app/lib/resources/coupon_resource";
import { CouponResource as CouponResourceClass } from "@app/lib/resources/coupon_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { CouponFactory } from "@app/tests/utils/CouponFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

function unwrapOk<T>(result: Result<T, Error>): T {
  expect(result.isOk()).toBe(true);
  if (!result.isOk()) {
    throw new Error("Expected Ok");
  }
  return result.value;
}

function unwrapErr<T>(result: Result<T, Error>): Error {
  expect(result.isErr()).toBe(true);
  if (!result.isErr()) {
    throw new Error("Expected Err");
  }
  return result.error;
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockCreateMetronomeCredit,
  mockUpdateMetronomeCreditEndDate,
  mockGetActiveContract,
  mockEmitAuditLogEvent,
  mockGetMetronomeRateCardById,
} = vi.hoisted(() => ({
  mockCreateMetronomeCredit: vi.fn(),
  mockUpdateMetronomeCreditEndDate: vi.fn(),
  mockGetActiveContract: vi.fn().mockResolvedValue(null),
  mockEmitAuditLogEvent: vi.fn().mockResolvedValue(undefined),
  mockGetMetronomeRateCardById: vi.fn(),
}));

vi.mock("@app/lib/metronome/client", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/client")
  >("@app/lib/metronome/client");
  return {
    ...actual,
    createMetronomeCredit: mockCreateMetronomeCredit,
    getMetronomeRateCardById: mockGetMetronomeRateCardById,
    updateMetronomeCreditEndDate: mockUpdateMetronomeCreditEndDate,
  };
});

vi.mock("@app/lib/metronome/plan_type", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/metronome/plan_type")>();
  return { ...actual, getActiveContract: mockGetActiveContract };
});

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();
  return { ...actual, emitAuditLogEvent: mockEmitAuditLogEvent };
});

vi.mock("@app/lib/metronome/constants", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/constants")
  >("@app/lib/metronome/constants");
  return {
    ...actual,
    getProductSeatSubscriptionCreditsId: () => "seat-subscription-credits-prod",
    getProductWorkspaceSeatId: () => "workspace-seat-prod",
  };
});

vi.mock("@app/logger/logger", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCoupon(
  overrides: Partial<{
    code: string;
    discountType: "seat";
    amount: number;
    durationMonths: number | null;
  }> = {}
): CouponResource {
  return {
    code: overrides.code ?? "TESTCODE",
    discountType: overrides.discountType ?? "seat",
    amount: overrides.amount ?? 10,
    durationMonths: overrides.durationMonths ?? null,
  } as unknown as CouponResource;
}

function makeContract(rateCardId: string | undefined = "rate-card-1"): {
  rate_card_id?: string;
} {
  return { rate_card_id: rateCardId };
}

function makeRateCard(fiatCreditTypeId: string | undefined): {
  id: string;
  created_at: string;
  created_by: string;
  name: string;
  fiat_credit_type?: { id: string; name: string };
} {
  return {
    id: "rate-card-1",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    name: "Test Rate Card",
    ...(fiatCreditTypeId !== undefined
      ? { fiat_credit_type: { id: fiatCreditTypeId, name: fiatCreditTypeId } }
      : {}),
  };
}

const REDEEMED_AT = new Date("2026-04-01T10:30:00.000Z");
const REDEMPTION_ID = "redemption-abc";

const METRONOME_CUSTOMER_ID = "test-metronome-customer-id";

async function makeWorkspaceWithUserAuth() {
  const ws = await WorkspaceFactory.basic();
  await WorkspaceResource.updateMetronomeCustomerId(
    ws.id,
    METRONOME_CUSTOMER_ID
  );
  const user = await UserFactory.basic();
  await MembershipFactory.associate(ws, user, { role: "user" });
  // Auth is fetched after the metronomeCustomerId update so getNonNullableWorkspace reflects it.
  const auth = await Authenticator.fromUserIdAndWorkspaceId(user.sId, ws.sId);
  return { auth };
}

async function makeWorkspaceWithUserAuthNoMetronome() {
  const ws = await WorkspaceFactory.basic();
  const user = await UserFactory.basic();
  await MembershipFactory.associate(ws, user, { role: "user" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(user.sId, ws.sId);
  return { auth };
}

beforeEach(() => {
  mockCreateMetronomeCredit.mockReset();
  mockUpdateMetronomeCreditEndDate.mockReset();
  mockGetActiveContract.mockReset();
  mockEmitAuditLogEvent.mockReset();
  mockGetMetronomeRateCardById.mockReset();
  mockCreateMetronomeCredit.mockResolvedValue(new Ok({ id: "credit-id-1" }));
  mockUpdateMetronomeCreditEndDate.mockResolvedValue(new Ok(undefined));
  mockGetActiveContract.mockResolvedValue({ rate_card_id: "rate-card-1" });
  mockEmitAuditLogEvent.mockResolvedValue(undefined);
  mockGetMetronomeRateCardById.mockResolvedValue(
    new Ok(makeRateCard(CREDIT_TYPE_USD_ID))
  );
});

// ---------------------------------------------------------------------------
// getCreditTypeFromContract
// ---------------------------------------------------------------------------

describe("getCreditTypeFromContract", () => {
  it("returns Ok with USD credit type from the rate card", async () => {
    mockGetMetronomeRateCardById.mockResolvedValueOnce(
      new Ok(makeRateCard(CREDIT_TYPE_USD_ID))
    );
    const result = await getCreditTypeFromContract(makeContract() as any);
    expect(unwrapOk(result)).toEqual({
      creditTypeId: CREDIT_TYPE_USD_ID,
      currency: "usd",
    });
    expect(mockGetMetronomeRateCardById).toHaveBeenCalledWith({
      rateCardId: "rate-card-1",
    });
  });

  it("returns Ok with EUR credit type from the rate card", async () => {
    mockGetMetronomeRateCardById.mockResolvedValueOnce(
      new Ok(makeRateCard(CREDIT_TYPE_EUR_ID))
    );
    const result = await getCreditTypeFromContract(makeContract() as any);
    expect(unwrapOk(result)).toEqual({
      creditTypeId: CREDIT_TYPE_EUR_ID,
      currency: "eur",
    });
  });

  it("returns Err when rate_card_id is absent", async () => {
    const result = await getCreditTypeFromContract({} as any);
    expect(result.isErr()).toBe(true);
    expect(mockGetMetronomeRateCardById).not.toHaveBeenCalled();
  });

  it("returns Err when rate card has no fiat_credit_type_id", async () => {
    mockGetMetronomeRateCardById.mockResolvedValueOnce(
      new Ok(makeRateCard(undefined))
    );
    const result = await getCreditTypeFromContract(makeContract() as any);
    expect(result.isErr()).toBe(true);
  });

  it("returns Err when fiat_credit_type_id is not a known currency", async () => {
    mockGetMetronomeRateCardById.mockResolvedValueOnce(
      new Ok(makeRateCard("unknown-credit-type-id"))
    );
    const result = await getCreditTypeFromContract(makeContract() as any);
    expect(result.isErr()).toBe(true);
    expect(unwrapErr(result).message).toContain("unknown-credit-type-id");
  });

  it("returns Err when rate card fetch fails", async () => {
    mockGetMetronomeRateCardById.mockResolvedValueOnce(
      new Err(new Error("api error"))
    );
    const result = await getCreditTypeFromContract(makeContract() as any);
    expect(unwrapErr(result).message).toBe("api error");
  });
});

// ---------------------------------------------------------------------------
// createCouponCredit
// ---------------------------------------------------------------------------

describe("createCouponCredit", () => {
  it("creates 1 credit spanning 1 month for a once coupon (durationMonths = null)", async () => {
    const coupon = makeCoupon({ durationMonths: null });

    const result = await createCouponCredit({
      metronomeCustomerId: "cust-1",
      coupon,
      redemptionId: REDEMPTION_ID,
      redeemedAt: REDEEMED_AT,
      creditTypeId: CREDIT_TYPE_USD_ID,
      currency: "usd",
    });

    expect(unwrapOk(result)).toEqual(["credit-id-1"]);
    expect(mockCreateMetronomeCredit).toHaveBeenCalledTimes(1);
    expect(mockCreateMetronomeCredit).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `coupon-${REDEMPTION_ID}-0`,
        priority: 0,
        applicableProductIds: ["workspace-seat-prod"],
        creditTypeId: CREDIT_TYPE_USD_ID,
        productId: "seat-subscription-credits-prod",
        amount: 1000,
      })
    );
  });

  it("passes EUR amount as whole units (no ×100 ratio) for EUR credit type", async () => {
    const coupon = makeCoupon({ amount: 10, durationMonths: null });

    await createCouponCredit({
      metronomeCustomerId: "cust-1",
      coupon,
      redemptionId: REDEMPTION_ID,
      redeemedAt: REDEEMED_AT,
      creditTypeId: CREDIT_TYPE_EUR_ID,
      currency: "eur",
    });

    expect(mockCreateMetronomeCredit).toHaveBeenCalledWith(
      expect.objectContaining({
        creditTypeId: CREDIT_TYPE_EUR_ID,
        amount: 10, // EUR: metronomeAmount(10 * 100, "eur") = 1000 / 100 = 10, not 1000
      })
    );
  });

  it("creates N monthly credits for a repeating coupon (durationMonths = N)", async () => {
    mockCreateMetronomeCredit
      .mockResolvedValueOnce(new Ok({ id: "credit-0" }))
      .mockResolvedValueOnce(new Ok({ id: "credit-1" }))
      .mockResolvedValueOnce(new Ok({ id: "credit-2" }));

    const coupon = makeCoupon({ durationMonths: 3 });

    const result = await createCouponCredit({
      metronomeCustomerId: "cust-1",
      coupon,
      redemptionId: REDEMPTION_ID,
      redeemedAt: REDEEMED_AT,
      creditTypeId: CREDIT_TYPE_USD_ID,
      currency: "usd",
    });

    expect(unwrapOk(result)).toEqual(["credit-0", "credit-1", "credit-2"]);
    expect(mockCreateMetronomeCredit).toHaveBeenCalledTimes(3);

    // Each call gets a sequential idempotency key
    for (let i = 0; i < 3; i++) {
      expect(mockCreateMetronomeCredit).toHaveBeenNthCalledWith(
        i + 1,
        expect.objectContaining({
          idempotencyKey: `coupon-${REDEMPTION_ID}-${i}`,
        })
      );
    }
  });

  it("uses correct monthly date boundaries for a 3-month repeating coupon", async () => {
    mockCreateMetronomeCredit
      .mockResolvedValueOnce(new Ok({ id: "c0" }))
      .mockResolvedValueOnce(new Ok({ id: "c1" }))
      .mockResolvedValueOnce(new Ok({ id: "c2" }));

    const coupon = makeCoupon({ durationMonths: 3 });

    await createCouponCredit({
      metronomeCustomerId: "cust-1",
      coupon,
      redemptionId: REDEMPTION_ID,
      redeemedAt: REDEEMED_AT,
      creditTypeId: CREDIT_TYPE_USD_ID,
      currency: "usd",
    });

    // Month 0: Apr → May
    expect(mockCreateMetronomeCredit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        startingAt: "2026-04-01T10:00:00.000Z",
        endingBefore: "2026-05-01T11:00:00.000Z",
      })
    );
    // Month 1: May → Jun
    expect(mockCreateMetronomeCredit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        startingAt: "2026-05-01T10:00:00.000Z",
        endingBefore: "2026-06-01T11:00:00.000Z",
      })
    );
  });

  it("uses correct 1-month date boundaries for a once coupon (durationMonths = null)", async () => {
    const coupon = makeCoupon({ durationMonths: null });

    await createCouponCredit({
      metronomeCustomerId: "cust-1",
      coupon,
      redemptionId: REDEMPTION_ID,
      redeemedAt: REDEEMED_AT,
      creditTypeId: CREDIT_TYPE_USD_ID,
      currency: "usd",
    });

    expect(mockCreateMetronomeCredit).toHaveBeenCalledWith(
      expect.objectContaining({
        startingAt: "2026-04-01T10:00:00.000Z",
        endingBefore: "2026-05-01T11:00:00.000Z",
      })
    );
  });

  it("excludes null results from idempotent conflicts in the returned ids", async () => {
    mockCreateMetronomeCredit
      .mockResolvedValueOnce(new Ok({ id: "credit-0" }))
      .mockResolvedValueOnce(new Ok(null)); // idempotent — already exists but lookup missed

    const coupon = makeCoupon({ durationMonths: 2 });

    const result = await createCouponCredit({
      metronomeCustomerId: "cust-1",
      coupon,
      redemptionId: REDEMPTION_ID,
      redeemedAt: REDEEMED_AT,
      creditTypeId: CREDIT_TYPE_USD_ID,
      currency: "usd",
    });

    expect(unwrapOk(result)).toEqual(["credit-0"]);
  });

  it("returns Err immediately when a Metronome credit creation fails", async () => {
    mockCreateMetronomeCredit.mockResolvedValueOnce(
      new Err(new Error("metronome down"))
    );

    const coupon = makeCoupon({ durationMonths: 3 });

    const result = await createCouponCredit({
      metronomeCustomerId: "cust-1",
      coupon,
      redemptionId: REDEMPTION_ID,
      redeemedAt: REDEEMED_AT,
      creditTypeId: CREDIT_TYPE_USD_ID,
      currency: "usd",
    });

    expect(unwrapErr(result).message).toBe("metronome down");
    // Should not attempt the remaining credits
    expect(mockCreateMetronomeCredit).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// endCouponCredit
// ---------------------------------------------------------------------------

describe("endCouponCredit", () => {
  const END_AT = new Date("2026-05-15T14:20:00.000Z");

  it("calls updateMetronomeCreditEndDate for each credit id", async () => {
    const result = await endCouponCredit({
      metronomeCustomerId: "cust-1",
      metronomeCreditIds: ["cid-1", "cid-2", "cid-3"],
      endAt: END_AT,
    });

    expect(result.isOk()).toBe(true);
    expect(mockUpdateMetronomeCreditEndDate).toHaveBeenCalledTimes(3);
    expect(mockUpdateMetronomeCreditEndDate).toHaveBeenCalledWith(
      expect.objectContaining({
        metronomeCustomerId: "cust-1",
        creditId: "cid-1",
      })
    );
    expect(mockUpdateMetronomeCreditEndDate).toHaveBeenCalledWith(
      expect.objectContaining({ creditId: "cid-2" })
    );
    expect(mockUpdateMetronomeCreditEndDate).toHaveBeenCalledWith(
      expect.objectContaining({ creditId: "cid-3" })
    );
  });

  it("uses a ceiled hour boundary for accessEndingBefore", async () => {
    await endCouponCredit({
      metronomeCustomerId: "cust-1",
      metronomeCreditIds: ["cid-1"],
      endAt: END_AT,
    });

    expect(mockUpdateMetronomeCreditEndDate).toHaveBeenCalledWith(
      expect.objectContaining({
        accessEndingBefore: "2026-05-15T15:00:00.000Z",
      })
    );
  });

  it("returns Ok(undefined) when the credit list is empty", async () => {
    const result = await endCouponCredit({
      metronomeCustomerId: "cust-1",
      metronomeCreditIds: [],
      endAt: END_AT,
    });

    expect(result.isOk()).toBe(true);
    expect(mockUpdateMetronomeCreditEndDate).not.toHaveBeenCalled();
  });

  it("returns Err on the first API failure and stops", async () => {
    mockUpdateMetronomeCreditEndDate
      .mockResolvedValueOnce(new Ok(undefined))
      .mockResolvedValueOnce(new Err(new Error("api error")));

    const result = await endCouponCredit({
      metronomeCustomerId: "cust-1",
      metronomeCreditIds: ["cid-1", "cid-2", "cid-3"],
      endAt: END_AT,
    });

    expect(unwrapErr(result).message).toBe("api error");
    expect(mockUpdateMetronomeCreditEndDate).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// redeemCoupon
// ---------------------------------------------------------------------------

describe("redeemCoupon", () => {
  it("happy path: seat/once coupon → active redemption, 1 credit ID, count incremented, audit emitted", async () => {
    const { auth } = await makeWorkspaceWithUserAuth();
    const coupon = await CouponFactory.create({ durationMonths: null });
    mockCreateMetronomeCredit.mockResolvedValue(new Ok({ id: "credit-abc" }));

    const result = await redeemCoupon(auth, { coupon });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }

    const redemption = result.value;
    expect(redemption.status).toBe("active");
    expect(redemption.metronomeCreditIds).toEqual(["credit-abc"]);

    const updated = await CouponResourceClass.fetchByCouponId(coupon.sId);
    expect(updated?.redemptionCount).toBe(1);

    expect(mockEmitAuditLogEvent).toHaveBeenCalledOnce();
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "coupon.redeemed" })
    );
  });

  it("durationMonths=3 coupon → 3 credit IDs stored, status active", async () => {
    const { auth } = await makeWorkspaceWithUserAuth();
    const coupon = await CouponFactory.create({ durationMonths: 3 });
    mockCreateMetronomeCredit
      .mockResolvedValueOnce(new Ok({ id: "credit-1" }))
      .mockResolvedValueOnce(new Ok({ id: "credit-2" }))
      .mockResolvedValueOnce(new Ok({ id: "credit-3" }));

    const result = await redeemCoupon(auth, { coupon });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }

    expect(result.value.status).toBe("active");
    expect(result.value.metronomeCreditIds).toEqual([
      "credit-1",
      "credit-2",
      "credit-3",
    ]);
    expect(mockCreateMetronomeCredit).toHaveBeenCalledTimes(3);
  });

  it("no active contract → Err", async () => {
    const { auth } = await makeWorkspaceWithUserAuth();
    const coupon = await CouponFactory.create();
    mockGetActiveContract.mockResolvedValueOnce(null);

    const result = await redeemCoupon(auth, { coupon });

    expect(result.isErr()).toBe(true);
    expect(mockCreateMetronomeCredit).not.toHaveBeenCalled();
  });

  it("workspace without metronomeCustomerId → workspace_not_on_metronome", async () => {
    const { auth } = await makeWorkspaceWithUserAuthNoMetronome();
    const coupon = await CouponFactory.create();

    const result = await redeemCoupon(auth, { coupon });

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error).toMatchObject({ code: "workspace_not_on_metronome" });
  });

  it("expirationDate in the past → coupon_validation_failed: expired", async () => {
    const { auth } = await makeWorkspaceWithUserAuth();
    const coupon = await CouponFactory.create({
      expirationDate: new Date(Date.now() - 1000),
    });

    const result = await redeemCoupon(auth, { coupon });

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error).toMatchObject({
      code: "coupon_validation_failed",
      reason: expect.objectContaining({ code: "expired" }),
    });
  });

  it("maxRedemptions reached → coupon_validation_failed: exhausted", async () => {
    const { auth } = await makeWorkspaceWithUserAuth();
    const coupon = await CouponFactory.create({
      maxRedemptions: 2,
      redemptionCount: 2,
    });

    const result = await redeemCoupon(auth, { coupon });

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error).toMatchObject({
      code: "coupon_validation_failed",
      reason: expect.objectContaining({ code: "exhausted" }),
    });
  });

  it("re-redeeming active coupon for same workspace → unique index violation, Err returned", async () => {
    const { auth } = await makeWorkspaceWithUserAuth();
    const coupon = await CouponFactory.create();
    mockCreateMetronomeCredit.mockResolvedValue(new Ok({ id: "credit-xyz" }));

    const first = await redeemCoupon(auth, { coupon });
    expect(first.isOk()).toBe(true);

    // The partial unique index on (couponId, workspaceId) WHERE status IN ('pending','active')
    // blocks a second pending/active row for the same workspace+coupon.
    const second = await redeemCoupon(auth, { coupon });
    expect(second.isErr()).toBe(true);
  });

  it("Metronome failure → status failed, redemptionCount decremented, same workspace can retry", async () => {
    const { auth } = await makeWorkspaceWithUserAuth();
    const coupon = await CouponFactory.create();
    mockCreateMetronomeCredit.mockResolvedValue(
      new Err(new Error("metronome down"))
    );

    const failResult = await redeemCoupon(auth, { coupon });
    expect(failResult.isErr()).toBe(true);

    const redemptions = await CouponRedemptionResource.listAllByCoupon(coupon);
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0].status).toBe("failed");

    const updatedCoupon = await CouponResourceClass.fetchByCouponId(coupon.sId);
    expect(updatedCoupon?.redemptionCount).toBe(0);

    // Retry succeeds — failed status does not trigger the unique index.
    mockCreateMetronomeCredit.mockResolvedValue(new Ok({ id: "credit-retry" }));
    const retryResult = await redeemCoupon(auth, { coupon });
    expect(retryResult.isOk()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// revokeCouponRedemption
// ---------------------------------------------------------------------------

describe("revokeCouponRedemption", () => {
  it("calls endCouponCredit with stored credit IDs, sets status revoked, emits audit event", async () => {
    const { auth } = await makeWorkspaceWithUserAuth();
    const coupon = await CouponFactory.create();
    mockCreateMetronomeCredit.mockResolvedValue(
      new Ok({ id: "credit-to-revoke" })
    );

    const redeemResult = await redeemCoupon(auth, { coupon });
    expect(redeemResult.isOk()).toBe(true);
    if (!redeemResult.isOk()) {
      return;
    }

    const redemption = redeemResult.value;
    mockEmitAuditLogEvent.mockClear();

    const revokeResult = await revokeCouponRedemption(auth, { redemption });

    expect(revokeResult.isOk()).toBe(true);
    expect(redemption.status).toBe("revoked");
    expect(mockUpdateMetronomeCreditEndDate).toHaveBeenCalledOnce();
    expect(mockUpdateMetronomeCreditEndDate).toHaveBeenCalledWith(
      expect.objectContaining({
        metronomeCustomerId: METRONOME_CUSTOMER_ID,
        creditId: "credit-to-revoke",
      })
    );
    expect(mockEmitAuditLogEvent).toHaveBeenCalledOnce();
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "coupon.revoked" })
    );
  });

  it("endCouponCredit failure → returns Err, redemption status unchanged", async () => {
    const { auth } = await makeWorkspaceWithUserAuth();
    const coupon = await CouponFactory.create();
    mockCreateMetronomeCredit.mockResolvedValue(new Ok({ id: "credit-fail" }));

    const redeemResult = await redeemCoupon(auth, { coupon });
    expect(redeemResult.isOk()).toBe(true);
    if (!redeemResult.isOk()) {
      return;
    }

    const redemption = redeemResult.value;
    mockUpdateMetronomeCreditEndDate.mockResolvedValue(
      new Err(new Error("Metronome unavailable"))
    );

    const revokeResult = await revokeCouponRedemption(auth, { redemption });

    expect(revokeResult.isErr()).toBe(true);
    expect(redemption.status).toBe("active");
  });
});
