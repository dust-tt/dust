import { applyCouponPlugin } from "@app/lib/api/poke/plugins/workspaces/apply_coupon";
import { revokeCouponPlugin } from "@app/lib/api/poke/plugins/workspaces/revoke_coupon";
import { Authenticator } from "@app/lib/auth";
import { CREDIT_TYPE_USD_ID } from "@app/lib/metronome/constants";
import { redeemCoupon } from "@app/lib/metronome/coupons";
import { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { CouponFactory } from "@app/tests/utils/CouponFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockCreateMetronomeCredit,
  mockGetMetronomeRateCardById,
  mockUpdateMetronomeCreditEndDate,
  mockEmitAuditLogEvent,
} = vi.hoisted(() => ({
  mockCreateMetronomeCredit: vi.fn(),
  mockGetMetronomeRateCardById: vi.fn(),
  mockUpdateMetronomeCreditEndDate: vi.fn(),
  mockEmitAuditLogEvent: vi.fn().mockResolvedValue(undefined),
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
  return {
    ...actual,
    getActiveContract: vi
      .fn()
      .mockResolvedValue({ rate_card_id: "rate-card-test-id" }),
  };
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

const METRONOME_CUSTOMER_ID = "metronome-test-customer-id";

async function makeWorkspaceWithMetronome() {
  const ws = await WorkspaceFactory.basic();
  await WorkspaceResource.updateMetronomeCustomerId(
    ws.id,
    METRONOME_CUSTOMER_ID
  );
  const user = await UserFactory.basic();
  await MembershipFactory.associate(ws, user, { role: "admin" });
  // Fetch auth after metronomeCustomerId update so getNonNullableWorkspace reflects it.
  const auth = await Authenticator.fromUserIdAndWorkspaceId(user.sId, ws.sId);
  return { workspace: ws, auth };
}

async function makeWorkspaceNoMetronome() {
  const ws = await WorkspaceFactory.basic();
  const user = await UserFactory.basic();
  await MembershipFactory.associate(ws, user, { role: "admin" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(user.sId, ws.sId);
  return { auth };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockCreateMetronomeCredit.mockReset();
  mockGetMetronomeRateCardById.mockReset();
  mockUpdateMetronomeCreditEndDate.mockReset();
  mockEmitAuditLogEvent.mockReset();
  mockCreateMetronomeCredit.mockResolvedValue(new Ok({ id: "credit-id-1" }));
  mockGetMetronomeRateCardById.mockResolvedValue(
    new Ok({ fiat_credit_type: { id: CREDIT_TYPE_USD_ID } })
  );
  mockUpdateMetronomeCreditEndDate.mockResolvedValue(new Ok(undefined));
  mockEmitAuditLogEvent.mockResolvedValue(undefined);
});

describe("applyCouponPlugin.execute", () => {
  it("applies a valid coupon → redemption created with active status and audit event emitted", async () => {
    const { auth } = await makeWorkspaceWithMetronome();
    const coupon = await CouponFactory.create({ durationMonths: null });
    mockCreateMetronomeCredit.mockResolvedValue(new Ok({ id: "credit-abc" }));

    const result = await applyCouponPlugin.execute(auth, null, {
      couponCode: coupon.code,
      confirm: true,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.display).toBe("text");
      expect(result.value.value).toContain(coupon.code);
    }

    const redemptions = await CouponRedemptionResource.listAllByCoupon(coupon);
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0].status).toBe("active");

    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "coupon.redeemed" })
    );
  });

  it("returns Err when coupon code is not found", async () => {
    const { auth } = await makeWorkspaceWithMetronome();

    const result = await applyCouponPlugin.execute(auth, null, {
      couponCode: "NONEXISTENT",
      confirm: true,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("NONEXISTENT");
    }
  });

  it("returns Err with workspace_not_on_metronome message when workspace has no Metronome customer ID", async () => {
    const { auth } = await makeWorkspaceNoMetronome();
    const coupon = await CouponFactory.create();

    const result = await applyCouponPlugin.execute(auth, null, {
      couponCode: coupon.code,
      confirm: true,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toMatch(/Metronome/i);
    }
  });

  it("returns Err when confirm is false", async () => {
    const { auth } = await makeWorkspaceWithMetronome();
    const coupon = await CouponFactory.create();

    const result = await applyCouponPlugin.execute(auth, null, {
      couponCode: coupon.code,
      confirm: false,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toMatch(/confirm/i);
    }
  });
});

describe("revokeCouponPlugin.execute", () => {
  it("revokes an active redemption → status revoked and audit event emitted", async () => {
    const { auth } = await makeWorkspaceWithMetronome();
    const coupon = await CouponFactory.create();

    const redeemResult = await redeemCoupon(auth, { coupon });
    expect(redeemResult.isOk()).toBe(true);
    if (!redeemResult.isOk()) {
      return;
    }
    const redemption = redeemResult.value;
    mockEmitAuditLogEvent.mockClear();

    const result = await revokeCouponPlugin.execute(auth, null, {
      redemptionId: [redemption.sId],
      confirm: true,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.display).toBe("text");
      expect(result.value.value).toContain(redemption.sId);
    }

    const redemptions = await CouponRedemptionResource.listAllByCoupon(coupon);
    expect(redemptions[0].status).toBe("revoked");

    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "coupon.revoked" })
    );
  });

  it("returns Err when redemption sId is not found", async () => {
    const { auth } = await makeWorkspaceWithMetronome();

    const result = await revokeCouponPlugin.execute(auth, null, {
      redemptionId: ["nonexistent-sid"],
      confirm: true,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("nonexistent-sid");
    }
  });

  it("returns Err when redemption belongs to a different workspace", async () => {
    const { auth: authA } = await makeWorkspaceWithMetronome();
    const { auth: authB } = await makeWorkspaceWithMetronome();
    const coupon = await CouponFactory.create();

    const redeemResult = await redeemCoupon(authA, { coupon });
    expect(redeemResult.isOk()).toBe(true);
    if (!redeemResult.isOk()) {
      return;
    }
    const redemptionOfA = redeemResult.value;

    // Workspace B tries to revoke workspace A's redemption.
    const result = await revokeCouponPlugin.execute(authB, null, {
      redemptionId: [redemptionOfA.sId],
      confirm: true,
    });

    expect(result.isErr()).toBe(true);
  });

  it("returns Err when Metronome fails to end the credit", async () => {
    const { auth } = await makeWorkspaceWithMetronome();
    const coupon = await CouponFactory.create();

    const redeemResult = await redeemCoupon(auth, { coupon });
    expect(redeemResult.isOk()).toBe(true);
    if (!redeemResult.isOk()) {
      return;
    }
    const redemption = redeemResult.value;

    mockUpdateMetronomeCreditEndDate.mockResolvedValue(
      new Err(new Error("Metronome unavailable"))
    );

    const result = await revokeCouponPlugin.execute(auth, null, {
      redemptionId: [redemption.sId],
      confirm: true,
    });

    expect(result.isErr()).toBe(true);

    // Redemption should remain active (not revoked).
    const redemptions = await CouponRedemptionResource.listAllByCoupon(coupon);
    expect(redemptions[0].status).toBe("active");
  });

  it("returns Err when confirm is false", async () => {
    const { auth } = await makeWorkspaceWithMetronome();
    const coupon = await CouponFactory.create();

    const redeemResult = await redeemCoupon(auth, { coupon });
    expect(redeemResult.isOk()).toBe(true);
    if (!redeemResult.isOk()) {
      return;
    }
    const redemption = redeemResult.value;

    const result = await revokeCouponPlugin.execute(auth, null, {
      redemptionId: [redemption.sId],
      confirm: false,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toMatch(/confirm/i);
    }
  });
});
