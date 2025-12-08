import type Stripe from "stripe";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Authenticator } from "@app/lib/auth";
import {
  calculateFreeCreditAmountMicroUsd,
  countEligibleUsersForFreeCredits,
  getCustomerPaymentStatus,
  grantFreeCreditsFromSubscriptionStateChange,
} from "@app/lib/credits/free";
import {
  getSubscriptionInvoices,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightWorkspaceType } from "@app/types";

vi.mock("@app/lib/plans/stripe", async () => {
  const actual = await vi.importActual("@app/lib/plans/stripe");
  return {
    ...actual,
    getSubscriptionInvoices: vi.fn(),
    isEnterpriseSubscription: vi.fn(),
  };
});

vi.mock("@app/lib/auth", async () => {
  const actual = await vi.importActual("@app/lib/auth");
  return {
    ...actual,
    getFeatureFlags: vi.fn(),
  };
});

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
      const result = await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS * 6)
      );
      expect(result).toBe("paying");
      expect(getSubscriptionInvoices).toHaveBeenCalledWith({
        subscriptionId: "sub_123",
        status: "paid",
        createdSinceDate: expect.any(Date),
      });
    });

    it("returns 'paying' with payment exactly at 2 billing cycles", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([
        makeInvoice(NOW - MONTH_SECONDS * 2),
      ]);
      const result = await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS * 6)
      );
      expect(result).toBe("paying");
    });

    it("returns 'paying' for trialing customer who paid early", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([
        makeInvoice(NOW - MONTH_SECONDS * 0.5),
      ]);
      const result = await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW, "trialing")
      );
      expect(result).toBe("paying");
    });

    it("returns 'paying' for new customer who paid early", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([
        makeInvoice(NOW - MONTH_SECONDS * 0.5),
      ]);
      const result = await getCustomerPaymentStatus(makeSubscription(NOW, NOW));
      expect(result).toBe("paying");
    });
  });

  describe("trialing customers (no paid invoice but trialing or new)", () => {
    it("returns 'trialing' for new subscription without paid invoices", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
      const result = await getCustomerPaymentStatus(makeSubscription(NOW, NOW));
      expect(result).toBe("trialing");
    });

    it("returns 'trialing' for subscription started just under 1 month ago", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
      const result = await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS + 1)
      );
      expect(result).toBe("trialing");
    });

    it("returns 'trialing' for trialing subscription without paid invoices", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
      const result = await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS * 2, "trialing")
      );
      expect(result).toBe("trialing");
    });
  });

  describe("not eligible (no recent payment and not trialing/new)", () => {
    it("returns 'not_paying' when no recent invoice (Stripe filters old ones)", async () => {
      // Stripe's createdSince filter would exclude old invoices, so mock returns empty
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
      const result = await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS * 6)
      );
      expect(result).toBe("not_paying");
    });

    it("returns 'not_paying' for old subscription with no paid invoices", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
      const result = await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS * 2)
      );
      expect(result).toBe("not_paying");
    });
  });

  describe("enterprise subscriptions", () => {
    it("returns 'paying' for enterprise subscriptions without checking invoices", async () => {
      vi.mocked(isEnterpriseSubscription).mockReturnValue(true);
      const result = await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS * 6)
      );
      expect(result).toBe("paying");
      expect(getSubscriptionInvoices).not.toHaveBeenCalled();
    });
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;
const USER_COUNT_CUTOFF_DAYS = 5;

describe("countEligibleUsersForFreeCredits", () => {
  let getMembersCountSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
    getMembersCountSpy = vi
      .spyOn(MembershipResource, "getMembersCountForWorkspace")
      .mockResolvedValue(42);
  });

  afterEach(() => {
    vi.useRealTimers();
    getMembersCountSpy.mockRestore();
  });

  it("counts members for subscription started 30 days ago", async () => {
    const result = await countEligibleUsersForFreeCredits(makeWorkspace());
    expect(result).toBe(42);
    expect(getMembersCountSpy).toHaveBeenCalledWith({
      workspace: expect.objectContaining({ sId: "ws_123" }),
      activeOnly: true,
      membershipSpan: {
        fromDate: new Date(NOW_MS - USER_COUNT_CUTOFF_DAYS * DAY_MS),
        toDate: new Date(NOW_MS - USER_COUNT_CUTOFF_DAYS * DAY_MS),
      },
    });
  });
});

describe("calculateFreeCreditAmountMicroUsd", () => {
  it("should return $5 per user for first 10 users", () => {
    expect(calculateFreeCreditAmountMicroUsd(1)).toBe(5_000_000);
    expect(calculateFreeCreditAmountMicroUsd(5)).toBe(25_000_000);
  });

  it("should return $50 for exactly 10 users", () => {
    expect(calculateFreeCreditAmountMicroUsd(10)).toBe(50_000_000);
  });

  it("should apply $2 per user for users 11-50", () => {
    expect(calculateFreeCreditAmountMicroUsd(11)).toBe(50_000_000 + 2_000_000);
    expect(calculateFreeCreditAmountMicroUsd(20)).toBe(50_000_000 + 20_000_000);
  });

  it("should return $130 for exactly 50 users (50 + 80)", () => {
    expect(calculateFreeCreditAmountMicroUsd(50)).toBe(50_000_000 + 80_000_000);
  });

  it("should apply $1 per user for users 51-100", () => {
    expect(calculateFreeCreditAmountMicroUsd(51)).toBe(
      50_000_000 + 80_000_000 + 1_000_000
    );
    expect(calculateFreeCreditAmountMicroUsd(75)).toBe(
      50_000_000 + 80_000_000 + 25_000_000
    );
  });

  it("should return $180 for exactly 100 users", () => {
    expect(calculateFreeCreditAmountMicroUsd(100)).toBe(
      50_000_000 + 80_000_000 + 50_000_000
    );
  });

  it("should cap at 100 users (ignore users beyond 100)", () => {
    expect(calculateFreeCreditAmountMicroUsd(150)).toBe(
      50_000_000 + 80_000_000 + 50_000_000
    );
    expect(calculateFreeCreditAmountMicroUsd(1000)).toBe(
      50_000_000 + 80_000_000 + 50_000_000
    );
  });

  it("should return 0 for 0 users", () => {
    expect(calculateFreeCreditAmountMicroUsd(0)).toBe(0);
  });
});

function makeFullSubscription(
  overrides: Partial<Stripe.Subscription> = {}
): Stripe.Subscription {
  return {
    id: "sub_test",
    current_period_start: NOW,
    current_period_end: NOW + MONTH_SECONDS,
    start_date: NOW - MONTH_SECONDS * 3,
    status: "active",
    items: { data: [], has_more: false, object: "list", url: "" },
    ...overrides,
  } as Stripe.Subscription;
}

describe("grantFreeCreditsOnSubscriptionRenewal", () => {
  let auth: Authenticator;
  let getMembersCountSpy: MockInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);

    const { authenticator } = await createResourceTest({ role: "admin" });
    auth = authenticator;

    vi.mocked(isEnterpriseSubscription).mockReturnValue(false);
    vi.mocked(getSubscriptionInvoices).mockResolvedValue([
      makeInvoice(NOW - MONTH_SECONDS * 0.5),
    ]);
    getMembersCountSpy = vi
      .spyOn(MembershipResource, "getMembersCountForWorkspace")
      .mockResolvedValue(10);
  });

  afterEach(() => {
    vi.useRealTimers();
    getMembersCountSpy.mockRestore();
  });

  it("should skip when credit already exists for billing cycle (idempotency)", async () => {
    const subscription = makeFullSubscription();
    const idempotencyKey = `free-renewal-${subscription.id}-${subscription.current_period_start}`;

    await CreditResource.makeNew(auth, {
      type: "free",
      initialAmountMicroUsd: 50_000_000,
      consumedAmountMicroUsd: 0,
      invoiceOrLineItemId: idempotencyKey,
    });

    const result = await grantFreeCreditsFromSubscriptionStateChange({
      auth,
      stripeSubscription: subscription,
    });

    expect(result.isOk()).toBe(true);
    const credits = await CreditResource.listAll(auth);
    expect(credits.length).toBe(1);
  });

  it("should return error for non-paying/non-trialing Pro subscription", async () => {
    vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
    const oldSubscription = makeFullSubscription({
      start_date: NOW - MONTH_SECONDS * 3,
      status: "active",
    });

    const result = await grantFreeCreditsFromSubscriptionStateChange({
      auth,
      stripeSubscription: oldSubscription,
    });

    expect(result.isErr()).toBe(true);
  });

  it("should always grant credits for enterprise subscriptions", async () => {
    vi.mocked(isEnterpriseSubscription).mockReturnValue(true);
    vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);

    const subscription = makeFullSubscription();

    const result = await grantFreeCreditsFromSubscriptionStateChange({
      auth,
      stripeSubscription: subscription,
    });

    expect(result.isOk()).toBe(true);
    expect(isEnterpriseSubscription).toHaveBeenCalledWith(subscription);
  });

  it("should use programmatic config override when freeCreditMicroUsd is set", async () => {
    const configResult = await ProgrammaticUsageConfigurationResource.makeNew(
      auth,
      {
        freeCreditMicroUsd: 250_000_000,
        defaultDiscountPercent: 0,
        paygCapMicroUsd: null,
      }
    );
    expect(configResult.isOk()).toBe(true);

    const subscription = makeFullSubscription();

    const result = await grantFreeCreditsFromSubscriptionStateChange({
      auth,
      stripeSubscription: subscription,
    });

    expect(result.isOk()).toBe(true);
    const credits = await CreditResource.listAll(auth);
    expect(credits[0].initialAmountMicroUsd).toBe(250_000_000);
  });

  it("should grant trial credit amount ($5) for trialing customers", async () => {
    vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
    const subscription = makeFullSubscription({
      status: "trialing",
      start_date: NOW,
    });

    const result = await grantFreeCreditsFromSubscriptionStateChange({
      auth,
      stripeSubscription: subscription,
    });

    expect(result.isOk()).toBe(true);
    const credits = await CreditResource.listAll(auth);
    expect(credits[0].initialAmountMicroUsd).toBe(5_000_000);
  });

  it("should calculate bracket-based credits for paying customers", async () => {
    getMembersCountSpy.mockResolvedValue(25);

    const subscription = makeFullSubscription();

    const result = await grantFreeCreditsFromSubscriptionStateChange({
      auth,
      stripeSubscription: subscription,
    });

    expect(result.isOk()).toBe(true);
    const credits = await CreditResource.listAll(auth);
    expect(credits[0].initialAmountMicroUsd).toBe(50_000_000 + 30_000_000);
  });

  it("should create credit with correct expiration date (period end)", async () => {
    const subscription = makeFullSubscription();

    const result = await grantFreeCreditsFromSubscriptionStateChange({
      auth,
      stripeSubscription: subscription,
    });

    expect(result.isOk()).toBe(true);
    const credits = await CreditResource.listAll(auth);
    expect(credits[0].expirationDate?.getTime()).toBe(
      subscription.current_period_end * 1000
    );
  });

  it("should start credit immediately after creation", async () => {
    const subscription = makeFullSubscription();

    const result = await grantFreeCreditsFromSubscriptionStateChange({
      auth,
      stripeSubscription: subscription,
    });

    expect(result.isOk()).toBe(true);
    const credits = await CreditResource.listAll(auth);
    expect(credits[0].startDate).not.toBeNull();
  });

  it("should use correct idempotency key format", async () => {
    const subscription = makeFullSubscription({ id: "sub_abc123" });

    await grantFreeCreditsFromSubscriptionStateChange({
      auth,
      stripeSubscription: subscription,
    });

    const credits = await CreditResource.listAll(auth);
    expect(credits[0].invoiceOrLineItemId).toBe(
      `free-renewal-sub_abc123-${subscription.current_period_start}`
    );
  });

  it("should verify isEnterpriseSubscription is called with correct subscription", async () => {
    const subscription = makeFullSubscription({ id: "sub_verify" });

    await grantFreeCreditsFromSubscriptionStateChange({
      auth,
      stripeSubscription: subscription,
    });

    expect(isEnterpriseSubscription).toHaveBeenCalledWith(subscription);
  });
});
