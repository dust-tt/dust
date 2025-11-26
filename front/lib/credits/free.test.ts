import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isSubscriptionEligibleForFreeCredits } from "@app/lib/credits/free";
import { getSubscriptionInvoices } from "@app/lib/plans/stripe";

vi.mock("@app/lib/plans/stripe", async () => {
  const actual = await vi.importActual("@app/lib/plans/stripe");
  return {
    ...actual,
    getSubscriptionInvoices: vi.fn(),
  };
});

const MONTH_SECONDS = 30 * 24 * 60 * 60;
const NOW = 1700000000; // Fixed timestamp for tests
const NOW_MS = NOW * 1000;

function makeSubscription(
  currentPeriodStart: number,
  startDate: number
): Stripe.Subscription {
  return {
    id: "sub_123",
    current_period_start: currentPeriodStart,
    start_date: startDate,
  } as Stripe.Subscription;
}

function makeInvoice(periodEnd: number): Stripe.Invoice {
  return {
    period_end: periodEnd,
    billing_reason: "subscription_cycle",
    status: "paid",
  } as Stripe.Invoice;
}

describe("isSubscriptionEligibleForFreeCredits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("new customers (subscription started within 2 months)", () => {
    it("returns true for subscription started 1 month ago", async () => {
      const startDate = NOW - MONTH_SECONDS;
      const result = await isSubscriptionEligibleForFreeCredits(
        makeSubscription(NOW, startDate)
      );
      expect(result).toBe(true);
      expect(getSubscriptionInvoices).not.toHaveBeenCalled();
    });

    it("returns true for subscription started today", async () => {
      const result = await isSubscriptionEligibleForFreeCredits(
        makeSubscription(NOW, NOW)
      );
      expect(result).toBe(true);
      expect(getSubscriptionInvoices).not.toHaveBeenCalled();
    });
  });

  describe("existing customers (subscription started more than 2 months ago)", () => {
    const oldStartDate = NOW - MONTH_SECONDS * 6; // Started 6 months ago

    it("returns true with recent payment (within 2 billing cycles)", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([
        makeInvoice(NOW - MONTH_SECONDS * 0.5),
      ]);
      const result = await isSubscriptionEligibleForFreeCredits(
        makeSubscription(NOW, oldStartDate)
      );
      expect(result).toBe(true);
    });

    it("returns true with payment exactly at 2 billing cycles", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([
        makeInvoice(NOW - MONTH_SECONDS * 2),
      ]);
      const result = await isSubscriptionEligibleForFreeCredits(
        makeSubscription(NOW, oldStartDate)
      );
      expect(result).toBe(true);
    });

    it("returns false with old payment (more than 2 billing cycles ago)", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([
        makeInvoice(NOW - MONTH_SECONDS * 2.5),
      ]);
      const result = await isSubscriptionEligibleForFreeCredits(
        makeSubscription(NOW, oldStartDate)
      );
      expect(result).toBe(false);
    });

    it("returns false with no paid invoices", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
      const result = await isSubscriptionEligibleForFreeCredits(
        makeSubscription(NOW, oldStartDate)
      );
      expect(result).toBe(false);
    });
  });
});
