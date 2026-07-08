import * as metronomeClient from "@app/lib/metronome/client";
import { CURRENCY_TO_CREDIT_TYPE_ID } from "@app/lib/metronome/constants";
import type { MetronomeCredit } from "@app/lib/metronome/types";
import { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import { CouponFactory } from "@app/tests/utils/CouponFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/client", async () => {
  const actual = await vi.importActual<typeof metronomeClient>(
    "@app/lib/metronome/client"
  );
  return {
    ...actual,
    listMetronomeCustomerCredits: vi.fn(),
  };
});

function redemptionsUrl(wId: string) {
  return `/api/w/${wId}/coupon/redemptions`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW_MS = Date.now();
const TWO_MONTHS_AGO = new Date(NOW_MS - 60 * DAY_MS).toISOString();
const ONE_MONTH_AGO = new Date(NOW_MS - 30 * DAY_MS).toISOString();
const ONE_WEEK_AGO = new Date(NOW_MS - 7 * DAY_MS).toISOString();
const NEXT_YEAR = new Date(NOW_MS + 365 * DAY_MS).toISOString();

// A seat coupon credit in USD: Metronome amounts are already in cents.
function makeSeatCouponCredit({
  id,
  amountCents,
  balanceCents,
  deductions,
}: {
  id: string;
  amountCents: number;
  balanceCents: number;
  deductions: { amountCents: number; timestamp: string }[];
}): MetronomeCredit {
  return {
    id,
    type: "CREDIT",
    product: { id: "product-seat-credits", name: "Seat subscription credits" },
    balance: balanceCents,
    access_schedule: {
      credit_type: { id: CURRENCY_TO_CREDIT_TYPE_ID.usd, name: "USD (cents)" },
      schedule_items: [
        {
          id: `${id}-item-0`,
          amount: amountCents,
          starting_at: TWO_MONTHS_AGO,
          ending_before: NEXT_YEAR,
        },
      ],
    },
    ledger: [
      {
        type: "CREDIT_SEGMENT_START",
        amount: amountCents,
        segment_id: `${id}-segment`,
        timestamp: TWO_MONTHS_AGO,
      },
      ...deductions.map((d) => ({
        type: "CREDIT_AUTOMATED_INVOICE_DEDUCTION" as const,
        amount: -d.amountCents,
        invoice_id: "invoice-id",
        segment_id: `${id}-segment`,
        timestamp: d.timestamp,
      })),
    ],
    name: "Coupon: SEAT500",
  };
}

beforeEach(() => {
  vi.mocked(metronomeClient.listMetronomeCustomerCredits).mockResolvedValue(
    new Ok([])
  );
});

describe("GET /api/w/[wId]/coupon/redemptions", () => {
  it("returns 403 when the caller is a user", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(redemptionsUrl(workspace.sId));

    expect(response.status).toBe(403);
    expect(metronomeClient.listMetronomeCustomerCredits).not.toHaveBeenCalled();
  });

  it("returns an empty list without calling Metronome when nothing was redeemed", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const response = await honoApp.request(redemptionsUrl(workspace.sId));

    expect(response.status).toBe(200);
    expect((await response.json()).coupons).toEqual([]);
    expect(metronomeClient.listMetronomeCustomerCredits).not.toHaveBeenCalled();
  });

  it("returns credit pool top-up redemptions without calling Metronome", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const { auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const coupon = await CouponFactory.create({
      discountType: "credit_pool_top_up",
      amount: 1000,
    });
    const pending = await CouponRedemptionResource.createPending(auth, {
      coupon,
    });
    if (pending.isErr()) {
      throw pending.error;
    }
    await pending.value.markActive(["metronome-credit-topup"]);

    const response = await honoApp.request(redemptionsUrl(workspace.sId));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.coupons).toEqual([
      {
        discountType: "credit_pool_top_up",
        redemptionId: pending.value.sId,
        code: coupon.code,
        status: "active",
        redeemedAtMs: pending.value.redeemedAt.getTime(),
        amountCredits: 1000,
      },
    ]);
    expect(metronomeClient.listMetronomeCustomerCredits).not.toHaveBeenCalled();
  });

  it("returns seat coupon redemptions with their consumption ledger, including revoked ones", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const { auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const activeCoupon = await CouponFactory.create({
      discountType: "seat",
      amount: 500,
    });
    const activePending = await CouponRedemptionResource.createPending(auth, {
      coupon: activeCoupon,
    });
    if (activePending.isErr()) {
      throw activePending.error;
    }
    await activePending.value.markActive(["credit-active"]);

    const revokedCoupon = await CouponFactory.create({
      discountType: "seat",
      amount: 100,
    });
    const revokedPending = await CouponRedemptionResource.createPending(auth, {
      coupon: revokedCoupon,
    });
    if (revokedPending.isErr()) {
      throw revokedPending.error;
    }
    await revokedPending.value.markActive(["credit-revoked"]);
    await revokedPending.value.markRevoked();

    // A failed redemption must not be surfaced.
    const failedCoupon = await CouponFactory.create({ discountType: "seat" });
    const failedPending = await CouponRedemptionResource.createPending(auth, {
      coupon: failedCoupon,
    });
    if (failedPending.isErr()) {
      throw failedPending.error;
    }
    await failedPending.value.markFailed();

    // The endpoint fetches each credit individually by id.
    const creditsById: Record<string, MetronomeCredit> = {
      "credit-active": makeSeatCouponCredit({
        id: "credit-active",
        amountCents: 50_000,
        balanceCents: 42_000,
        deductions: [
          { amountCents: 4_000, timestamp: ONE_MONTH_AGO },
          { amountCents: 4_000, timestamp: ONE_WEEK_AGO },
        ],
      }),
      "credit-revoked": makeSeatCouponCredit({
        id: "credit-revoked",
        amountCents: 10_000,
        balanceCents: 0,
        deductions: [{ amountCents: 2_000, timestamp: ONE_MONTH_AGO }],
      }),
    };
    vi.mocked(metronomeClient.listMetronomeCustomerCredits).mockImplementation(
      async ({ creditId }) => {
        const credit = creditId ? creditsById[creditId] : undefined;
        return new Ok(credit ? [credit] : []);
      }
    );

    const response = await honoApp.request(redemptionsUrl(workspace.sId));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.coupons).toHaveLength(2);

    const active = body.coupons.find(
      (c: { code: string }) => c.code === activeCoupon.code
    );
    expect(active).toEqual({
      discountType: "seat",
      redemptionId: activePending.value.sId,
      code: activeCoupon.code,
      status: "active",
      redeemedAtMs: activePending.value.redeemedAt.getTime(),
      totalAmountCents: 50_000,
      remainingAmountCents: 42_000,
      currency: "usd",
      consumptions: [
        {
          timestampMs: new Date(ONE_MONTH_AGO).getTime(),
          amountCents: 4_000,
        },
        { timestampMs: new Date(ONE_WEEK_AGO).getTime(), amountCents: 4_000 },
      ],
    });

    const revoked = body.coupons.find(
      (c: { code: string }) => c.code === revokedCoupon.code
    );
    expect(revoked).toEqual({
      discountType: "seat",
      redemptionId: revokedPending.value.sId,
      code: revokedCoupon.code,
      status: "revoked",
      redeemedAtMs: revokedPending.value.redeemedAt.getTime(),
      totalAmountCents: 10_000,
      remainingAmountCents: 0,
      currency: "usd",
      consumptions: [
        {
          timestampMs: new Date(ONE_MONTH_AGO).getTime(),
          amountCents: 2_000,
        },
      ],
    });

    // One targeted call per seat coupon credit.
    expect(metronomeClient.listMetronomeCustomerCredits).toHaveBeenCalledTimes(
      2
    );
  });
});
