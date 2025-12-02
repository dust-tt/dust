import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  countEligibleUsersForFreeCredits,
  getCustomerStatus,
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

describe("checkCustomerStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("paying customers (have recent paid invoice)", () => {
    it("returns 'paying' with recent payment (within 2 billing cycles)", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([
        makeInvoice(NOW - MONTH_SECONDS * 0.5),
      ]);
      const result = await getCustomerStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS * 6)
      );
      expect(result).toBe("paying");
      expect(getSubscriptionInvoices).toHaveBeenCalledWith("sub_123", {
        status: "paid",
        limit: 1,
      });
    });

    it("returns 'paying' with payment exactly at 2 billing cycles", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([
        makeInvoice(NOW - MONTH_SECONDS * 2),
      ]);
      const result = await getCustomerStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS * 6)
      );
      expect(result).toBe("paying");
    });

    it("returns 'paying' for trialing customer who paid early", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([
        makeInvoice(NOW - MONTH_SECONDS * 0.5),
      ]);
      const result = await getCustomerStatus(
        makeSubscription(NOW, NOW, "trialing")
      );
      expect(result).toBe("paying");
    });

    it("returns 'paying' for new customer who paid early", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([
        makeInvoice(NOW - MONTH_SECONDS * 0.5),
      ]);
      const result = await getCustomerStatus(makeSubscription(NOW, NOW));
      expect(result).toBe("paying");
    });
  });

  describe("trialing customers (no paid invoice but trialing or new)", () => {
    it("returns 'trialing' for new subscription without paid invoices", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
      const result = await getCustomerStatus(makeSubscription(NOW, NOW));
      expect(result).toBe("trialing");
    });

    it("returns 'trialing' for subscription started just under 1 month ago", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
      const result = await getCustomerStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS + 1)
      );
      expect(result).toBe("trialing");
    });

    it("returns 'trialing' for trialing subscription without paid invoices", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
      const result = await getCustomerStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS * 2, "trialing")
      );
      expect(result).toBe("trialing");
    });
  });

  describe("not eligible (no recent payment and not trialing/new)", () => {
    it("returns null with old payment (more than 2 billing cycles ago)", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([
        makeInvoice(NOW - MONTH_SECONDS * 2.5),
      ]);
      const result = await getCustomerStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS * 6)
      );
      expect(result).toBe(null);
    });

    it("returns null for old subscription with no paid invoices", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
      const result = await getCustomerStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS * 2)
      );
      expect(result).toBe(null);
    });
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

  it("counts members for subscription started 30 days ago", async () => {
    vi.mocked(MembershipResource.getMembersCountForWorkspace).mockResolvedValue(
      42
    );
    const result = await countEligibleUsersForFreeCredits(makeWorkspace());
    expect(result).toBe(42);
    expect(MembershipResource.getMembersCountForWorkspace).toHaveBeenCalledWith(
      {
        workspace: expect.objectContaining({ sId: "ws_123" }),
        activeOnly: true,
        membershipSpan: {
          fromDate: new Date(NOW_MS - USER_COUNT_CUTOFF_DAYS * DAY_MS),
          toDate: new Date(NOW_MS - USER_COUNT_CUTOFF_DAYS * DAY_MS),
        },
      }
    );
  });
});
