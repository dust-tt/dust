import {
  cleanAndFinalizeMetronomeDraftInvoice,
  createCreditPurchaseCoupon,
  finalizeInvoice,
  getCreditAmountFromInvoice,
  getCreditPurchaseCouponId,
  getStripePricingData,
  getSubscriptionInvoices,
  isCreditPurchaseInvoice,
  isEnterpriseSubscription,
  makeAndFinalizeCreditsPAYGInvoice,
  makeCreditPurchaseOneOffInvoiceForSubscription,
  payInvoice,
  voidInvoiceWithReason,
} from "@app/lib/plans/stripe";
import type { Stripe } from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockInvoices,
  mockCoupons,
  mockSubscriptions,
  mockInvoiceItems,
  mockPrices,
} = vi.hoisted(() => {
  const mockInvoices = {
    list: vi.fn(),
    create: vi.fn(),
    finalizeInvoice: vi.fn(),
    pay: vi.fn(),
    retrieve: vi.fn(),
    voidInvoice: vi.fn(),
    update: vi.fn(),
    listLineItems: vi.fn(),
  };

  const mockInvoiceItems = {
    create: vi.fn(),
    del: vi.fn(),
    update: vi.fn(),
  };

  const mockCoupons = {
    retrieve: vi.fn(),
    create: vi.fn(),
  };

  const mockSubscriptions = {
    retrieve: vi.fn(),
  };

  const mockPrices = {
    retrieve: vi.fn(),
  };

  return {
    mockInvoices,
    mockCoupons,
    mockSubscriptions,
    mockInvoiceItems,
    mockPrices,
  };
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
    getAppUrl: vi.fn(() => "https://test.example.com"),
  },
}));

vi.mock("stripe", () => {
  const mockClient = {
    invoices: mockInvoices,
    invoiceItems: mockInvoiceItems,
    coupons: mockCoupons,
    subscriptions: mockSubscriptions,
    prices: mockPrices,
  };

  return {
    Stripe: Object.assign(
      vi.fn(function () {
        return mockClient;
      }),
      {
        errors: {
          StripeError: MockStripeError,
          StripeInvalidRequestError: MockStripeInvalidRequestError,
        },
      }
    ),
  };
});

vi.mock("@app/lib/resources/workspace_resource", () => ({
  WorkspaceResource: { fetchById: vi.fn(async () => null) },
}));

vi.mock("@app/lib/resources/credit_usage_configuration_resource", () => ({
  CreditUsageConfigurationResource: {
    fetchByWorkspaceModelId: vi.fn(async () => null),
  },
}));

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

    const createdSince = new Date("2024-01-01T00:00:00Z");
    const result = await getSubscriptionInvoices({
      subscriptionId: "sub_123",
      status: "paid",
      createdSinceDate: createdSince,
    });

    expect(mockInvoices.list).toHaveBeenCalledWith({
      subscription: "sub_123",
      status: "paid",
      created: { gte: Math.floor(createdSince.getTime() / 1000) },
    });
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(["in_1", "in_2"]);
  });

  it("should apply date filter when createdSince is provided", async () => {
    mockInvoices.list.mockResolvedValue({
      data: [{ id: "in_1", billing_reason: "subscription_cycle" }],
    });

    const createdSince = new Date("2024-01-01T00:00:00Z");
    await getSubscriptionInvoices({
      subscriptionId: "sub_123",
      createdSinceDate: createdSince,
    });

    expect(mockInvoices.list).toHaveBeenCalledWith({
      subscription: "sub_123",
      status: undefined,
      created: { gte: Math.floor(createdSince.getTime() / 1000) },
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

    const result = await makeCreditPurchaseOneOffInvoiceForSubscription({
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
        automatic_tax: { enabled: true },
        payment_settings: {
          payment_method_options: {
            card: { request_three_d_secure: "automatic" },
          },
        },
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

    await makeCreditPurchaseOneOffInvoiceForSubscription({
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

    const result = await makeCreditPurchaseOneOffInvoiceForSubscription({
      stripeSubscriptionId: "sub_invalid",
      amountMicroUsd: 100_000_000,
      collectionMethod: "charge_automatically",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.error_message).toContain("not found");
    }
  });

  it("should create invoice with 3DS challenge when requestThreeDSecure is challenge", async () => {
    mockSubscriptions.retrieve.mockResolvedValue({
      id: "sub_pro",
      customer: "cus_123",
    });
    mockInvoices.create.mockResolvedValue({ id: "in_pro" });
    mockInvoiceItems.create.mockResolvedValue({ id: "ii_1" });

    const result = await makeCreditPurchaseOneOffInvoiceForSubscription({
      stripeSubscriptionId: "sub_pro",
      amountMicroUsd: 100_000_000,
      collectionMethod: "charge_automatically",
      requestThreeDSecure: "challenge",
    });

    expect(result.isOk()).toBe(true);
    expect(mockInvoices.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_settings: {
          payment_method_options: {
            card: { request_three_d_secure: "challenge" },
          },
        },
      }),
      undefined
    );
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

    const result = await makeCreditPurchaseOneOffInvoiceForSubscription({
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
        automatic_tax: { enabled: true },
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
    expect(mockInvoices.finalizeInvoice).toHaveBeenCalledWith("in_123", {
      auto_advance: true,
    });
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
        automatic_tax: { enabled: true },
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

describe("getStripePricingData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return currency options for a fully configured price", async () => {
    mockPrices.retrieve.mockResolvedValue({
      unit_amount: 1000,
      currency_options: {
        usd: { unit_amount: 1000 },
        eur: { unit_amount: 900 },
        gbp: { unit_amount: 800 },
      },
    });

    const result = await getStripePricingData("price_test");

    expect(result).toEqual({
      currencyOptions: {
        usd: { unitAmount: 1000 },
        eur: { unitAmount: 900 },
        gbp: { unitAmount: 800 },
      },
    });
  });

  it("should not throw when a supported currency option is missing", async () => {
    // Price configured with USD only; EUR and GBP have no currency option.
    mockPrices.retrieve.mockResolvedValue({
      unit_amount: 1000,
      currency_options: {
        usd: { unit_amount: 1000 },
      },
    });

    const result = await getStripePricingData("price_test");

    expect(result).toEqual({
      currencyOptions: {
        usd: { unitAmount: 1000 },
        eur: { unitAmount: 0 },
        gbp: { unitAmount: 0 },
      },
    });
  });
});

describe("cleanAndFinalizeMetronomeDraftInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeMetronomeLine({
    id,
    amountCents,
    quantity = 1,
    unitAmountDecimalCents = null,
    currency = "eur",
    description = "Pro Seat",
  }: {
    id: string;
    amountCents: number;
    quantity?: number;
    unitAmountDecimalCents?: string | null;
    currency?: string;
    description?: string;
  }): Stripe.InvoiceLineItem {
    return {
      id,
      amount: amountCents,
      quantity,
      currency,
      description,
      invoice_item: `ii_${id}`,
      price:
        unitAmountDecimalCents !== null
          ? { unit_amount_decimal: unitAmountDecimalCents }
          : null,
    } as unknown as Stripe.InvoiceLineItem;
  }

  function setupMetronomeDraftInvoice({
    lines,
    totalCents,
  }: {
    lines: Stripe.InvoiceLineItem[];
    totalCents: number;
  }) {
    const invoice = makeInvoice({
      metadata: { metronome_customer_id: "mc_1" },
      total: totalCents,
      currency: "eur",
    });
    mockInvoices.retrieve.mockResolvedValue(invoice);
    mockInvoices.update.mockResolvedValue(invoice);
    mockInvoices.finalizeInvoice.mockResolvedValue({
      ...invoice,
      status: "open",
    });
    mockInvoices.listLineItems.mockReturnValue(
      (async function* () {
        yield* lines;
      })()
    );
    mockInvoiceItems.del.mockResolvedValue({});
    mockInvoiceItems.update.mockResolvedValue({});
  }

  it("should normalize a sub-cent unit price, keeping quantity when the total divides evenly", async () => {
    setupMetronomeDraftInvoice({
      lines: [
        makeMetronomeLine({
          id: "l1",
          amountCents: 1965,
          quantity: 1,
          unitAmountDecimalCents: "1964.516129032258",
        }),
      ],
      totalCents: 1965,
    });

    const result = await cleanAndFinalizeMetronomeDraftInvoice({
      invoiceId: "in_test",
      workspaceId: "w_test",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.outcome).toBe("cleaned");
    }
    expect(mockInvoiceItems.update).toHaveBeenCalledWith("ii_l1", {
      quantity: 1,
      unit_amount: 1965,
    });
    expect(mockInvoiceItems.del).not.toHaveBeenCalled();
    expect(mockInvoices.finalizeInvoice).toHaveBeenCalledWith("in_test", {
      auto_advance: true,
    });
  });

  it("should keep a quantity > 1 when the total divides evenly by it", async () => {
    setupMetronomeDraftInvoice({
      lines: [
        makeMetronomeLine({
          id: "l1",
          amountCents: 3930,
          quantity: 2,
          unitAmountDecimalCents: "1964.9",
        }),
      ],
      totalCents: 3930,
    });

    const result = await cleanAndFinalizeMetronomeDraftInvoice({
      invoiceId: "in_test",
      workspaceId: "w_test",
    });

    expect(result.isOk()).toBe(true);
    expect(mockInvoiceItems.update).toHaveBeenCalledWith("ii_l1", {
      quantity: 2,
      unit_amount: 1965,
    });
  });

  it("should keep the quantity and use the fewest sub-cent decimals when the total does not divide evenly", async () => {
    setupMetronomeDraftInvoice({
      lines: [
        makeMetronomeLine({
          id: "l1",
          amountCents: 5894,
          quantity: 3,
          unitAmountDecimalCents: "1964.666666666667",
        }),
      ],
      totalCents: 5894,
    });

    const result = await cleanAndFinalizeMetronomeDraftInvoice({
      invoiceId: "in_test",
      workspaceId: "w_test",
    });

    expect(result.isOk()).toBe(true);
    // 1964.7 cents × 3 = 5894.1 cents, which rounds back to the exact total.
    expect(mockInvoiceItems.update).toHaveBeenCalledWith("ii_l1", {
      quantity: 3,
      unit_amount_decimal: "1964.7",
    });
  });

  it("should keep adding decimals until the total reconstructs exactly, even for large quantities", async () => {
    setupMetronomeDraftInvoice({
      lines: [
        makeMetronomeLine({
          id: "l1",
          amountCents: 1001,
          quantity: 1000,
          unitAmountDecimalCents: "1.001000000000",
        }),
      ],
      totalCents: 1001,
    });

    const result = await cleanAndFinalizeMetronomeDraftInvoice({
      invoiceId: "in_test",
      workspaceId: "w_test",
    });

    expect(result.isOk()).toBe(true);
    // 1 and 2 decimals round the total to 1000 cents; 3 decimals are exact.
    expect(mockInvoiceItems.update).toHaveBeenCalledWith("ii_l1", {
      quantity: 1000,
      unit_amount_decimal: "1.001",
    });
  });

  it("should leave whole-cent unit prices and price-less lines untouched", async () => {
    setupMetronomeDraftInvoice({
      lines: [
        makeMetronomeLine({
          id: "l1",
          amountCents: 1900,
          unitAmountDecimalCents: "1900",
        }),
        makeMetronomeLine({
          id: "l2",
          amountCents: 500,
          unitAmountDecimalCents: null,
        }),
      ],
      totalCents: 2400,
    });

    const result = await cleanAndFinalizeMetronomeDraftInvoice({
      invoiceId: "in_test",
      workspaceId: "w_test",
    });

    expect(result.isOk()).toBe(true);
    expect(mockInvoiceItems.update).not.toHaveBeenCalled();
    expect(mockInvoices.finalizeInvoice).toHaveBeenCalledWith("in_test", {
      auto_advance: true,
    });
  });

  it("should delete a commit-applied pair when the label is its own parenthesized group", async () => {
    setupMetronomeDraftInvoice({
      lines: [
        makeMetronomeLine({
          id: "l1",
          amountCents: 5300,
          description:
            "Platform Seat (Yearly) (Platform Seat (Yearly) commitment: 53 seats)",
        }),
        makeMetronomeLine({
          id: "l2",
          amountCents: -5300,
          description: "Platform Seat (Yearly) commitment: 53 seats applied",
        }),
        makeMetronomeLine({
          id: "l3",
          amountCents: 1900,
          description: "Pro Seat",
        }),
      ],
      totalCents: 1900,
    });

    const result = await cleanAndFinalizeMetronomeDraftInvoice({
      invoiceId: "in_test",
      workspaceId: "w_test",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.outcome).toBe("cleaned");
    }
    expect(mockInvoiceItems.del).toHaveBeenCalledWith("ii_l1");
    expect(mockInvoiceItems.del).toHaveBeenCalledWith("ii_l2");
    expect(mockInvoiceItems.del).not.toHaveBeenCalledWith("ii_l3");
  });

  it("should delete a commit-applied pair when the label is the last element of the qty/price group", async () => {
    // a commit split across two positive lines, each offset by its
    // own negative "applied" line, with the label embedded as
    // "Name (qty, $price, label)". The same-amount line without the label
    // (l3) must survive.
    const commitLabel = "Business subscription activation (max monthly)";
    setupMetronomeDraftInvoice({
      lines: [
        makeMetronomeLine({
          id: "l1",
          amountCents: 14980,
          description: `Max Seat (prorated) (${commitLabel})`,
        }),
        makeMetronomeLine({
          id: "l2",
          amountCents: 20,
          description: `Max Seat (0.0013440860215053763441, $150.00, ${commitLabel})`,
        }),
        makeMetronomeLine({
          id: "l3",
          amountCents: 14980,
          description: "Max Seat (0.99865591397849462366, $150.00)",
        }),
        makeMetronomeLine({
          id: "l4",
          amountCents: -14980,
          description: `${commitLabel} applied`,
        }),
        makeMetronomeLine({
          id: "l5",
          amountCents: -20,
          description: `${commitLabel} applied`,
        }),
      ],
      totalCents: 14980,
    });

    const result = await cleanAndFinalizeMetronomeDraftInvoice({
      invoiceId: "in_test",
      workspaceId: "w_test",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.outcome).toBe("cleaned");
    }
    expect(mockInvoiceItems.del).toHaveBeenCalledWith("ii_l1");
    expect(mockInvoiceItems.del).toHaveBeenCalledWith("ii_l2");
    expect(mockInvoiceItems.del).toHaveBeenCalledWith("ii_l4");
    expect(mockInvoiceItems.del).toHaveBeenCalledWith("ii_l5");
    expect(mockInvoiceItems.del).not.toHaveBeenCalledWith("ii_l3");
    expect(mockInvoices.finalizeInvoice).toHaveBeenCalledWith("in_test", {
      auto_advance: true,
    });
  });

  it("should delete negative lines without normalizing them", async () => {
    setupMetronomeDraftInvoice({
      lines: [
        makeMetronomeLine({
          id: "l1",
          amountCents: -1965,
          unitAmountDecimalCents: "-1964.516129032258",
        }),
        makeMetronomeLine({
          id: "l2",
          amountCents: 1900,
          unitAmountDecimalCents: "1900",
        }),
      ],
      totalCents: 1900,
    });

    const result = await cleanAndFinalizeMetronomeDraftInvoice({
      invoiceId: "in_test",
      workspaceId: "w_test",
    });

    expect(result.isOk()).toBe(true);
    expect(mockInvoiceItems.del).toHaveBeenCalledWith("ii_l1");
    expect(mockInvoiceItems.update).not.toHaveBeenCalled();
  });
});
