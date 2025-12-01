import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  countEligibleUsersForFreeCredits,
  isSubscriptionEligibleForFreeCredits,
} from "@app/lib/credits/free";
import { getSubscriptionInvoices } from "@app/lib/plans/stripe";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { LightWorkspaceType } from "@app/types";

vi.mock("@app/lib/plans/stripe", async () => {
  const actual = await vi.importActual("@app/lib/plans/stripe");
  return {
    ...actual,
    getSubscriptionInvoices: vi.fn(),
  };
});

vi.mock("@app/lib/resources/membership_resource", () => ({
  MembershipResource: {
    getMembersCountForWorkspace: vi.fn(),
  },
}));

const MONTH_SECONDS = 30 * 24 * 60 * 60;
const NOW = 1700000000; // Fixed timestamp for tests
const NOW_MS = NOW * 1000;

function makeSubscription(
  currentPeriodStart: number,
  startDate: number,
  status: Stripe.Subscription.Status = "active"
): Stripe.Subscription {
  return {
    id: "sub_123",
    current_period_start: currentPeriodStart,
    start_date: startDate,
    status,
  } as Stripe.Subscription;
}

function makeInvoice(periodEnd: number): Stripe.Invoice {
  return {
    period_end: periodEnd,
    billing_reason: "subscription_cycle",
    status: "paid",
  } as Stripe.Invoice;
}

function makeWorkspace(
  overrides: Partial<LightWorkspaceType> = {}
): LightWorkspaceType {
  return {
    id: 1,
    sId: "ws_123",
    name: "Test Workspace",
    role: "admin",
    segmentation: null,
    whiteListedProviders: null,
    defaultEmbeddingProvider: null,
    metadata: null,
    ...overrides,
  };
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

  it("returns true with recent payment (within 2 billing cycles)", async () => {
    vi.mocked(getSubscriptionInvoices).mockResolvedValue([
      makeInvoice(NOW - MONTH_SECONDS * 0.5),
    ]);
    const result = await isSubscriptionEligibleForFreeCredits(
      makeSubscription(NOW, NOW - MONTH_SECONDS * 6)
    );
    expect(result).toBe(true);
    expect(getSubscriptionInvoices).toHaveBeenCalledWith("sub_123", {
      status: "paid",
      limit: 1,
    });
  });

  it("returns true with payment exactly at 2 billing cycles", async () => {
    vi.mocked(getSubscriptionInvoices).mockResolvedValue([
      makeInvoice(NOW - MONTH_SECONDS * 2),
    ]);
    const result = await isSubscriptionEligibleForFreeCredits(
      makeSubscription(NOW, NOW - MONTH_SECONDS * 6)
    );
    expect(result).toBe(true);
  });

  it("returns false with old payment (more than 2 billing cycles ago)", async () => {
    vi.mocked(getSubscriptionInvoices).mockResolvedValue([
      makeInvoice(NOW - MONTH_SECONDS * 2.5),
    ]);
    const result = await isSubscriptionEligibleForFreeCredits(
      makeSubscription(NOW, NOW - MONTH_SECONDS * 6)
    );
    expect(result).toBe(false);
  });

  it("returns false with no paid invoices", async () => {
    vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
    const result = await isSubscriptionEligibleForFreeCredits(
      makeSubscription(NOW, NOW - MONTH_SECONDS * 6)
    );
    expect(result).toBe(false);
  });

  it("returns false for new subscription with no paid invoices yet", async () => {
    vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
    const result = await isSubscriptionEligibleForFreeCredits(
      makeSubscription(NOW, NOW)
    );
    expect(result).toBe(false);
  });

  it("returns true for trialing subscription even without paid invoices", async () => {
    vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
    const result = await isSubscriptionEligibleForFreeCredits(
      makeSubscription(NOW, NOW, "trialing")
    );
    expect(result).toBe(true);
    expect(getSubscriptionInvoices).not.toHaveBeenCalled();
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;
const USER_COUNT_CUTOFF_DAYS = 5;

describe("countEligibleUsersForFreeCredits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("new customers (subscription started within cutoff period)", () => {
    it("returns 1 for subscription started today", async () => {
      const result = await countEligibleUsersForFreeCredits(
        makeWorkspace(),
        NOW_MS
      );
      expect(result).toBe(1);
      expect(
        MembershipResource.getMembersCountForWorkspace
      ).not.toHaveBeenCalled();
    });

    it("returns 1 for subscription started 4 days ago", async () => {
      const subscriptionStartMs = NOW_MS - 4 * DAY_MS;
      const result = await countEligibleUsersForFreeCredits(
        makeWorkspace(),
        subscriptionStartMs
      );
      expect(result).toBe(1);
      expect(
        MembershipResource.getMembersCountForWorkspace
      ).not.toHaveBeenCalled();
    });

    it("returns 1 for subscription started just under 5 days ago", async () => {
      const subscriptionStartMs = NOW_MS - USER_COUNT_CUTOFF_DAYS * DAY_MS + 1;
      const result = await countEligibleUsersForFreeCredits(
        makeWorkspace(),
        subscriptionStartMs
      );
      expect(result).toBe(1);
      expect(
        MembershipResource.getMembersCountForWorkspace
      ).not.toHaveBeenCalled();
    });
  });

  describe("existing customers (subscription started before cutoff period)", () => {
    it("counts members for subscription started exactly 5 days ago", async () => {
      vi.mocked(
        MembershipResource.getMembersCountForWorkspace
      ).mockResolvedValue(15);
      const subscriptionStartMs = NOW_MS - USER_COUNT_CUTOFF_DAYS * DAY_MS;
      const result = await countEligibleUsersForFreeCredits(
        makeWorkspace(),
        subscriptionStartMs
      );
      expect(result).toBe(15);
      expect(
        MembershipResource.getMembersCountForWorkspace
      ).toHaveBeenCalledWith({
        workspace: expect.objectContaining({ sId: "ws_123" }),
        activeOnly: true,
        membershipSpan: {
          fromDate: new Date(NOW_MS - USER_COUNT_CUTOFF_DAYS * DAY_MS),
          toDate: new Date(NOW_MS - USER_COUNT_CUTOFF_DAYS * DAY_MS),
        },
      });
    });

    it("counts members for subscription started 30 days ago", async () => {
      vi.mocked(
        MembershipResource.getMembersCountForWorkspace
      ).mockResolvedValue(42);
      const subscriptionStartMs = NOW_MS - 30 * DAY_MS;
      const result = await countEligibleUsersForFreeCredits(
        makeWorkspace(),
        subscriptionStartMs
      );
      expect(result).toBe(42);
      expect(
        MembershipResource.getMembersCountForWorkspace
      ).toHaveBeenCalledWith({
        workspace: expect.objectContaining({ sId: "ws_123" }),
        activeOnly: true,
        membershipSpan: {
          fromDate: new Date(NOW_MS - USER_COUNT_CUTOFF_DAYS * DAY_MS),
          toDate: new Date(NOW_MS - USER_COUNT_CUTOFF_DAYS * DAY_MS),
        },
      });
    });
  });
});
