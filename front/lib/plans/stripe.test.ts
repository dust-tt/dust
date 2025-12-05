import type { Stripe } from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCreditPurchaseCoupon,
  finalizeInvoice,
  getCreditAmountFromInvoice,
  getCreditPurchaseCouponId,
  getSubscriptionInvoices,
  isCreditPurchaseInvoice,
  isEnterpriseSubscription,
  makeAndFinalizeCreditsPAYGInvoice,
  makeCreditPurchaseOneOffInvoice,
  payInvoice,
  voidInvoiceWithReason,
} from "@app/lib/plans/stripe";

const { mockInvoices, mockCoupons, mockSubscriptions, mockInvoiceItems } =
  vi.hoisted(() => {
    const mockInvoices = {
      list: vi.fn(),
      create: vi.fn(),
      finalizeInvoice: vi.fn(),
      pay: vi.fn(),
      retrieve: vi.fn(),
      voidInvoice: vi.fn(),
      update: vi.fn(),
    };

    const mockInvoiceItems = {
      create: vi.fn(),
    };

    const mockCoupons = {
      retrieve: vi.fn(),
      create: vi.fn(),
    };

    const mockSubscriptions = {
      retrieve: vi.fn(),
    };

    return { mockInvoices, mockCoupons, mockSubscriptions, mockInvoiceItems };
  });

const { MockStripeError, MockStripeInvalidRequestError } = vi.hoisted(() => {
  class MockStripeError extends Error {
    code?: string;
    constructor(message: string, code?: string) {
      super(message);
      this.code = code;
    }
  }

  class MockStripeInvalidRequestError extends MockStripeError {
    constructor(message: string, code?: string) {
      super(message, code);
    }
  }

  return { MockStripeError, MockStripeInvalidRequestError };
});

vi.mock("@app/lib/api/config", () => ({
  default: {
    getStripeSecretKey: vi.fn(() => "sk_test_mock_key"),
    getClientFacingUrl: vi.fn(() => "https://test.example.com"),
  },
}));

vi.mock("stripe", () => {
  const mockClient = {
    invoices: mockInvoices,
    invoiceItems: mockInvoiceItems,
    coupons: mockCoupons,
    subscriptions: mockSubscriptions,
  };

  return {
    Stripe: Object.assign(
      vi.fn(() => mockClient),
      {
        errors: {
          StripeError: MockStripeError,
          StripeInvalidRequestError: MockStripeInvalidRequestError,
        },
      }
    ),
  };
});

const NOV_2024_START_SECONDS = 1730419200; // 2024-11-01
const DEC_2024_START_SECONDS = 1733011200; // 2024-12-01

function makeSubscription(
  overrides: Partial<Stripe.Subscription> = {}
): Stripe.Subscription {
  return {
    id: "sub_test",
    customer: "cus_test",
    status: "active",
    items: {
      data: [],
      has_more: false,
      object: "list",
      url: "/v1/subscription_items",
    },
    ...overrides,
  } as Stripe.Subscription;
}

function makeInvoice(overrides: Partial<Stripe.Invoice> = {}): Stripe.Invoice {
  return {
    id: "in_test",
    status: "draft",
    metadata: {},
    ...overrides,
  } as Stripe.Invoice;
}

function makeSubscriptionItemWithMetadata(
  reportUsage: string
): Stripe.SubscriptionItem {
  return {
    id: "si_test",
    object: "subscription_item",
    price: {
      id: "price_test",
      object: "price",
      recurring: {
        interval: "month",
        interval_count: 1,
        aggregate_usage: null,
        trial_period_days: null,
        usage_type: "licensed",
      },
      metadata: { REPORT_USAGE: reportUsage },
    },
  } as unknown as Stripe.SubscriptionItem;
}

function makeItemsList(
  items: Stripe.SubscriptionItem[]
): Stripe.ApiList<Stripe.SubscriptionItem> {
  return {
    object: "list",
    has_more: false,
    url: "/v1/subscription_items",
    data: items,
  };
}

describe("isEnterpriseSubscription", () => {
  it("should identify enterprise subscription (recurring items with REPORT_USAGE=FIXED)", () => {
    const subscription = makeSubscription({
      items: makeItemsList([makeSubscriptionItemWithMetadata("FIXED")]),
    });

    expect(isEnterpriseSubscription(subscription)).toBe(true);
  });

  it("should identify enterprise subscription (MAU_10)", () => {
    const subscription = makeSubscription({
      items: makeItemsList([makeSubscriptionItemWithMetadata("MAU_10")]),
    });

    expect(isEnterpriseSubscription(subscription)).toBe(true);
  });

  it("should identify Pro/Business subscriptions (REPORT_USAGE=PER_SEAT)", () => {
    const subscription = makeSubscription({
      items: makeItemsList([makeSubscriptionItemWithMetadata("PER_SEAT")]),
    });

    expect(isEnterpriseSubscription(subscription)).toBe(false);
  });

  it("should return false for mixed items (enterprise + pro)", () => {
    const subscription = makeSubscription({
      items: makeItemsList([
        makeSubscriptionItemWithMetadata("FIXED"),
        makeSubscriptionItemWithMetadata("PER_SEAT"),
      ]),
    });

    expect(isEnterpriseSubscription(subscription)).toBe(false);
  });

  it("should ignore deleted subscription items", () => {
    const deletedItem = {
      id: "si_deleted",
      object: "subscription_item",
      deleted: true,
      price: {
        id: "price_deleted",
        object: "price",
        recurring: {
          interval: "month",
          interval_count: 1,
          aggregate_usage: null,
          trial_period_days: null,
          usage_type: "licensed",
        },
        metadata: { REPORT_USAGE: "PER_SEAT" },
      },
    } as unknown as Stripe.SubscriptionItem;

    const subscription = makeSubscription({
      items: makeItemsList([
        deletedItem,
        makeSubscriptionItemWithMetadata("FIXED"),
      ]),
    });

    expect(isEnterpriseSubscription(subscription)).toBe(true);
  });
});

describe("credit purchase invoice helpers", () => {
  it("should identify valid credit purchase invoice", () => {
    const invoice = makeInvoice({
      metadata: {
        credit_purchase: "true",
        credit_amount_cents: "10000",
      },
    });

    expect(isCreditPurchaseInvoice(invoice)).toBe(true);
    expect(getCreditAmountFromInvoice(invoice)).toBe(10000);
  });

  it("should reject non-credit invoices (missing credit_purchase metadata)", () => {
    const invoice = makeInvoice({ metadata: {} });

    expect(isCreditPurchaseInvoice(invoice)).toBe(false);
    expect(getCreditAmountFromInvoice(invoice)).toBe(null);
  });

  it("should reject non-credit invoices (credit_purchase = 'false')", () => {
    const invoice = makeInvoice({
      metadata: {
        credit_purchase: "false",
        credit_amount_cents: "10000",
      },
    });

    expect(isCreditPurchaseInvoice(invoice)).toBe(false);
    expect(getCreditAmountFromInvoice(invoice)).toBe(null);
  });

  it("should reject invalid amounts (NaN)", () => {
    const invoice = makeInvoice({
      metadata: {
        credit_purchase: "true",
        credit_amount_cents: "invalid",
      },
    });

    expect(isCreditPurchaseInvoice(invoice)).toBe(true);
    expect(getCreditAmountFromInvoice(invoice)).toBe(null);
  });

  it("should reject invalid amounts (zero)", () => {
    const invoice = makeInvoice({
      metadata: {
        credit_purchase: "true",
        credit_amount_cents: "0",
      },
    });

    expect(getCreditAmountFromInvoice(invoice)).toBe(null);
  });

  it("should reject invalid amounts (negative)", () => {
    const invoice = makeInvoice({
      metadata: {
        credit_purchase: "true",
        credit_amount_cents: "-100",
      },
    });

    expect(getCreditAmountFromInvoice(invoice)).toBe(null);
  });
});

describe("getSubscriptionInvoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch recent paid invoices filtered by subscription_cycle/subscription_create", async () => {
    mockInvoices.list.mockResolvedValue({
      data: [
        { id: "in_1", billing_reason: "subscription_cycle", status: "paid" },
        { id: "in_2", billing_reason: "subscription_create", status: "paid" },
        { id: "in_3", billing_reason: "manual", status: "paid" },
      ],
    });

    const result = await getSubscriptionInvoices("sub_123", {
      status: "paid",
      limit: 10,
    });

    expect(mockInvoices.list).toHaveBeenCalledWith({
      subscription: "sub_123",
      status: "paid",
      created: undefined,
      limit: 10,
    });
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(["in_1", "in_2"]);
  });

  it("should apply date filter when createdSince is provided", async () => {
    mockInvoices.list.mockResolvedValue({
      data: [{ id: "in_1", billing_reason: "subscription_cycle" }],
    });

    const createdSince = new Date("2024-01-01T00:00:00Z");
    await getSubscriptionInvoices("sub_123", { createdSince });

    expect(mockInvoices.list).toHaveBeenCalledWith({
      subscription: "sub_123",
      status: undefined,
      created: { gte: Math.floor(createdSince.getTime() / 1000) },
      limit: 100,
    });
  });
});

describe("makeOneOffInvoice - Pro credit purchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create invoice for Pro customer with charge_automatically", async () => {
    mockSubscriptions.retrieve.mockResolvedValue({
      id: "sub_pro",
      customer: "cus_123",
    });
    mockInvoices.create.mockResolvedValue({ id: "in_pro" });
    mockInvoiceItems.create.mockResolvedValue({ id: "ii_1" });

    const result = await makeCreditPurchaseOneOffInvoice({
      stripeSubscriptionId: "sub_pro",
      amountMicroUsd: 100_000_000,
      collectionMethod: "charge_automatically",
    });

    expect(result.isOk()).toBe(true);
    expect(mockInvoices.create).toHaveBeenCalledWith(
      {
        customer: "cus_123",
        subscription: "sub_pro",
        collection_method: "charge_automatically",
        metadata: {
          credit_purchase: "true",
          credit_amount_cents: "10000",
        },
        auto_advance: true,
      },
      undefined
    );
    expect(mockInvoiceItems.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_123",
        quantity: 10000,
        invoice: "in_pro",
      })
    );
  });

  it("should create invoice with coupon when discountPercent provided", async () => {
    mockSubscriptions.retrieve.mockResolvedValue({
      id: "sub_pro",
      customer: "cus_123",
    });
    mockInvoices.create.mockResolvedValue({ id: "in_pro" });
    mockInvoiceItems.create.mockResolvedValue({ id: "ii_1" });

    await makeCreditPurchaseOneOffInvoice({
      stripeSubscriptionId: "sub_pro",
      amountMicroUsd: 100_000_000,
      couponId: "programmatic-usage-credits-once-20",
      collectionMethod: "charge_automatically",
    });

    expect(mockInvoiceItems.create).toHaveBeenCalledWith(
      expect.objectContaining({
        discounts: [{ coupon: "programmatic-usage-credits-once-20" }],
      })
    );
  });

  it("should return Err when subscription not found", async () => {
    mockSubscriptions.retrieve.mockResolvedValue(null);

    const result = await makeCreditPurchaseOneOffInvoice({
      stripeSubscriptionId: "sub_invalid",
      amountMicroUsd: 100_000_000,
      collectionMethod: "charge_automatically",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.error_message).toContain("not found");
    }
  });
});

describe("makeOneOffInvoice - Enterprise credit purchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create invoice with send_invoice and days_until_due", async () => {
    mockSubscriptions.retrieve.mockResolvedValue({
      id: "sub_enterprise",
      customer: "cus_456",
    });
    mockInvoices.create.mockResolvedValue({ id: "in_enterprise" });
    mockInvoiceItems.create.mockResolvedValue({ id: "ii_1" });

    const result = await makeCreditPurchaseOneOffInvoice({
      stripeSubscriptionId: "sub_enterprise",
      amountMicroUsd: 5_000_000_000,
      collectionMethod: "send_invoice",
      daysUntilDue: 30,
    });

    expect(result.isOk()).toBe(true);
    expect(mockInvoices.create).toHaveBeenCalledWith(
      {
        customer: "cus_456",
        subscription: "sub_enterprise",
        collection_method: "send_invoice",
        days_until_due: 30,
        metadata: {
          credit_purchase: "true",
          credit_amount_cents: "500000",
        },
        auto_advance: true,
      },
      undefined
    );
  });
});

describe("finalizeInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should finalize draft invoice and return finalized invoice on success", async () => {
    const finalizedInvoice = { id: "in_123", status: "open" };
    mockInvoices.finalizeInvoice.mockResolvedValue(finalizedInvoice);

    const result = await finalizeInvoice(makeInvoice({ id: "in_123" }));

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe("open");
    }
    expect(mockInvoices.finalizeInvoice).toHaveBeenCalledWith("in_123");
  });

  it("should return Err on Stripe failure", async () => {
    mockInvoices.finalizeInvoice.mockRejectedValue(
      new Error("Stripe API error")
    );

    const result = await finalizeInvoice(makeInvoice({ id: "in_123" }));

    expect(result.isErr()).toBe(true);
  });
});

describe("payInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return paymentUrl: null on immediate success", async () => {
    mockInvoices.pay.mockResolvedValue({ id: "in_123", status: "paid" });

    const result = await payInvoice(makeInvoice({ id: "in_123" }));

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.paymentUrl).toBeNull();
    }
  });

  it("should return paymentUrl when 3DS/action required", async () => {
    mockInvoices.pay.mockRejectedValue(new Error("requires_action"));
    mockInvoices.retrieve.mockResolvedValue({
      id: "in_123",
      hosted_invoice_url: "https://checkout.stripe.com/3ds",
    });

    const result = await payInvoice(makeInvoice({ id: "in_123" }));

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.paymentUrl).toBe("https://checkout.stripe.com/3ds");
    }
  });

  it("should return Err when payment fails and no hosted URL available", async () => {
    mockInvoices.pay.mockRejectedValue(new Error("card_declined"));
    mockInvoices.retrieve.mockResolvedValue({
      id: "in_123",
      hosted_invoice_url: null,
    });

    const result = await payInvoice(makeInvoice({ id: "in_123" }));

    expect(result.isErr()).toBe(true);
  });
});

describe("voidInvoiceWithReason", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should void invoice and set void_reason metadata", async () => {
    mockInvoices.voidInvoice.mockResolvedValue({
      id: "in_123",
      status: "void",
    });
    mockInvoices.update.mockResolvedValue({ id: "in_123" });

    const result = await voidInvoiceWithReason(
      "in_123",
      "failed_upfront_pro_credit_purchase"
    );

    expect(result.isOk()).toBe(true);
    expect(mockInvoices.voidInvoice).toHaveBeenCalledWith("in_123");
    expect(mockInvoices.update).toHaveBeenCalledWith("in_123", {
      metadata: { void_reason: "failed_upfront_pro_credit_purchase" },
    });
  });

  it("should return Err on Stripe API failure", async () => {
    mockInvoices.voidInvoice.mockRejectedValue(
      new Error("Invoice cannot be voided")
    );

    const result = await voidInvoiceWithReason("in_123", "test_reason");

    expect(result.isErr()).toBe(true);
  });
});

describe("getCreditPurchaseCouponId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return existing coupon ID when coupon already exists", async () => {
    mockCoupons.retrieve.mockResolvedValue({
      id: "programmatic-usage-credits-once-10",
    });

    const result = await getCreditPurchaseCouponId(10);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("programmatic-usage-credits-once-10");
    }
    expect(mockCoupons.retrieve).toHaveBeenCalledWith(
      "programmatic-usage-credits-once-10"
    );
    expect(mockCoupons.create).not.toHaveBeenCalled();
  });

  it("should create new coupon when not found (resource_missing)", async () => {
    const resourceMissingError = new MockStripeInvalidRequestError(
      "No such coupon: programmatic-usage-credits-once-25",
      "resource_missing"
    );
    mockCoupons.retrieve.mockRejectedValue(resourceMissingError);
    mockCoupons.create.mockResolvedValue({
      id: "programmatic-usage-credits-once-25",
    });

    const result = await getCreditPurchaseCouponId(25);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("programmatic-usage-credits-once-25");
    }
    expect(mockCoupons.create).toHaveBeenCalledWith({
      id: "programmatic-usage-credits-once-25",
      percent_off: 25,
      duration: "once",
      name: "Programmatic Usage Credits Discount",
    });
  });
});

describe("createCreditPurchaseCoupon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return existing coupon when retrieve succeeds", async () => {
    mockCoupons.retrieve.mockResolvedValue({
      id: "existing-coupon",
    });

    const result = await createCreditPurchaseCoupon("existing-coupon", 15);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("existing-coupon");
    }
  });

  it("should create coupon with percent_off and duration=once when not found", async () => {
    const resourceMissingError = new MockStripeInvalidRequestError(
      "No such coupon",
      "resource_missing"
    );
    mockCoupons.retrieve.mockRejectedValue(resourceMissingError);
    mockCoupons.create.mockResolvedValue({ id: "new-coupon" });

    const result = await createCreditPurchaseCoupon("new-coupon", 20);

    expect(result.isOk()).toBe(true);
    expect(mockCoupons.create).toHaveBeenCalledWith({
      id: "new-coupon",
      percent_off: 20,
      duration: "once",
      name: "Programmatic Usage Credits Discount",
    });
  });
});

describe("makeCreditsPAYGInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create arrears invoice with correct metadata and line item", async () => {
    mockInvoices.create.mockResolvedValue({ id: "in_payg" });
    mockInvoiceItems.create.mockResolvedValue({ id: "ii_payg" });
    mockInvoices.finalizeInvoice.mockResolvedValue({ id: "in_payg" });

    const periodStart = NOV_2024_START_SECONDS;
    const periodEnd = DEC_2024_START_SECONDS;

    const result = await makeAndFinalizeCreditsPAYGInvoice({
      stripeSubscription: makeSubscription({
        id: "sub_enterprise",
        customer: "cus_123",
      }),
      amountMicroUsd: 150_000_000,
      periodStartSeconds: periodStart,
      periodEndSeconds: periodEnd,
      idempotencyKey: "credits-payg-arrears-test",
      daysUntilDue: 30,
    });

    expect(result.isOk()).toBe(true);
    expect(mockInvoices.create).toHaveBeenCalledWith(
      {
        customer: "cus_123",
        subscription: "sub_enterprise",
        collection_method: "send_invoice",
        days_until_due: 30,
        metadata: {
          credits_payg: "true",
          arrears_invoice: "true",
          credits_amount_cents: "15000",
          credits_period_start: periodStart.toString(),
          credits_period_end: periodEnd.toString(),
        },
        auto_advance: true,
      },
      { idempotencyKey: "credits-payg-arrears-test" }
    );
    expect(mockInvoiceItems.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_123",
        quantity: 15000,
        invoice: "in_payg",
      })
    );
    expect(mockInvoices.finalizeInvoice).toHaveBeenCalledWith("in_payg");
  });

  it("should return Err with error_type='idempotency' when invoice already created", async () => {
    const idempotencyError = new MockStripeError(
      "Idempotency key in use",
      "idempotency_key_in_use"
    );
    mockInvoices.create.mockRejectedValue(idempotencyError);

    const result = await makeAndFinalizeCreditsPAYGInvoice({
      stripeSubscription: makeSubscription({
        id: "sub_enterprise",
        customer: "cus_123",
      }),
      amountMicroUsd: 150_000_000,
      periodStartSeconds: NOV_2024_START_SECONDS,
      periodEndSeconds: DEC_2024_START_SECONDS,
      idempotencyKey: "credits-payg-arrears-duplicate",
      daysUntilDue: 30,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.error_type).toBe("idempotency");
    }
  });

  it("should return Err with error_type='other' on general Stripe failure", async () => {
    mockInvoices.create.mockRejectedValue(new Error("Stripe API unavailable"));

    const result = await makeAndFinalizeCreditsPAYGInvoice({
      stripeSubscription: makeSubscription({
        id: "sub_enterprise",
        customer: "cus_123",
      }),
      amountMicroUsd: 150_000_000,
      periodStartSeconds: NOV_2024_START_SECONDS,
      periodEndSeconds: DEC_2024_START_SECONDS,
      idempotencyKey: "credits-payg-arrears-error",
      daysUntilDue: 30,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.error_type).toBe("other");
    }
  });
});
