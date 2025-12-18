import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Authenticator } from "@app/lib/auth";
import {
  createEnterpriseCreditPurchase,
  createProCreditPurchase,
  deleteCreditFromVoidedInvoice,
  startCreditFromProOneOffInvoice,
  voidFailedProCreditPurchaseInvoice,
} from "@app/lib/credits/committed";
import {
  ENTERPRISE_N30_PAYMENTS_DAYS,
  finalizeInvoice,
  getCreditAmountFromInvoice,
  getCreditPurchaseCouponId,
  isCreditPurchaseInvoice,
  isEnterpriseSubscription,
  makeCreditPurchaseOneOffInvoice,
  MAX_PRO_INVOICE_ATTEMPTS_BEFORE_VOIDED,
  payInvoice,
  voidInvoiceWithReason,
} from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Err, Ok } from "@app/types";

const MONTH_SECONDS = 30 * 24 * 60 * 60;
const NOW = 1700000000; // Fixed timestamp for tests

vi.mock("@app/lib/plans/stripe", async () => {
  const actual = await vi.importActual("@app/lib/plans/stripe");
  return {
    ...actual,
    isEnterpriseSubscription: vi.fn(),
    isCreditPurchaseInvoice: vi.fn(),
    getCreditAmountFromInvoice: vi.fn(),
    voidInvoiceWithReason: vi.fn(),
    getCreditPurchaseCouponId: vi.fn(),
    makeCreditPurchaseOneOffInvoice: vi.fn(),
    finalizeInvoice: vi.fn(),
    payInvoice: vi.fn(),
  };
});

function makeProSubscription(
  overrides: Partial<Stripe.Subscription> = {}
): Stripe.Subscription {
  return {
    id: "sub_pro",
    current_period_start: NOW,
    current_period_end: NOW + MONTH_SECONDS,
    start_date: NOW - MONTH_SECONDS * 3,
    status: "active",
    customer: "cus_123",
    items: { data: [], has_more: false, object: "list", url: "" },
    ...overrides,
  } as Stripe.Subscription;
}

function makeCreditPurchaseInvoice(
  overrides: Partial<Stripe.Invoice> = {}
): Stripe.Invoice {
  return {
    id: "in_credit_purchase",
    status: "paid",
    attempt_count: 1,
    metadata: {
      credit_purchase: "true",
      credit_amount_cents: "10000",
    },
    ...overrides,
  } as Stripe.Invoice;
}

describe("startCreditFromProOneOffInvoice", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { authenticator } = await createResourceTest({ role: "admin" });
    auth = authenticator;
  });

  it("should throw when invoice is not a credit purchase invoice", async () => {
    vi.mocked(isCreditPurchaseInvoice).mockReturnValue(false);
    vi.mocked(isEnterpriseSubscription).mockReturnValue(false);

    const invoice = makeCreditPurchaseInvoice();
    const subscription = makeProSubscription();

    await expect(
      startCreditFromProOneOffInvoice({
        auth,
        invoice,
        stripeSubscription: subscription,
      })
    ).rejects.toThrow("Cannot process this invoice for credit purchase");

    expect(isCreditPurchaseInvoice).toHaveBeenCalledWith(invoice);
  });

  it("should throw when subscription is enterprise", async () => {
    vi.mocked(isCreditPurchaseInvoice).mockReturnValue(true);
    vi.mocked(isEnterpriseSubscription).mockReturnValue(true);

    const invoice = makeCreditPurchaseInvoice();
    const subscription = makeProSubscription();

    await expect(
      startCreditFromProOneOffInvoice({
        auth,
        invoice,
        stripeSubscription: subscription,
      })
    ).rejects.toThrow("Cannot process this invoice for credit purchase");

    expect(isEnterpriseSubscription).toHaveBeenCalledWith(subscription);
  });

  it("should return error when credit amount metadata is invalid", async () => {
    vi.mocked(isCreditPurchaseInvoice).mockReturnValue(true);
    vi.mocked(isEnterpriseSubscription).mockReturnValue(false);
    vi.mocked(getCreditAmountFromInvoice).mockReturnValue(null);

    const invoice = makeCreditPurchaseInvoice();
    const subscription = makeProSubscription();

    const result = await startCreditFromProOneOffInvoice({
      auth,
      invoice,
      stripeSubscription: subscription,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        "Invalid credit amount in invoice metadata"
      );
    }
  });

  it("should return error when credit not found for invoice", async () => {
    vi.mocked(isCreditPurchaseInvoice).mockReturnValue(true);
    vi.mocked(isEnterpriseSubscription).mockReturnValue(false);
    vi.mocked(getCreditAmountFromInvoice).mockReturnValue(10000);

    const invoice = makeCreditPurchaseInvoice();
    const subscription = makeProSubscription();

    const result = await startCreditFromProOneOffInvoice({
      auth,
      invoice,
      stripeSubscription: subscription,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Credit not found for invoice");
    }
  });

  it("should start credit successfully when all conditions met", async () => {
    vi.mocked(isCreditPurchaseInvoice).mockReturnValue(true);
    vi.mocked(isEnterpriseSubscription).mockReturnValue(false);
    vi.mocked(getCreditAmountFromInvoice).mockReturnValue(10000);

    const invoice = makeCreditPurchaseInvoice();
    const subscription = makeProSubscription();

    await CreditResource.makeNew(auth, {
      type: "committed",
      initialAmountMicroUsd: 100_000_000,
      consumedAmountMicroUsd: 0,
      invoiceOrLineItemId: invoice.id,
    });

    const result = await startCreditFromProOneOffInvoice({
      auth,
      invoice,
      stripeSubscription: subscription,
    });

    expect(result.isOk()).toBe(true);
    const credits = await CreditResource.listAll(auth);
    expect(credits[0].startDate).not.toBeNull();
  });
});

describe("voidFailedProCreditPurchaseInvoice", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { authenticator } = await createResourceTest({ role: "admin" });
    auth = authenticator;
  });

  it("should return voided:false when attempt_count is less than max", async () => {
    const invoice = makeCreditPurchaseInvoice({
      attempt_count: MAX_PRO_INVOICE_ATTEMPTS_BEFORE_VOIDED - 1,
    });

    const result = await voidFailedProCreditPurchaseInvoice({ auth, invoice });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.voided).toBe(false);
    }
    expect(voidInvoiceWithReason).not.toHaveBeenCalled();
  });

  it("should void invoice when attempt_count reaches max", async () => {
    const invoice = makeCreditPurchaseInvoice({
      id: "in_to_void",
      attempt_count: MAX_PRO_INVOICE_ATTEMPTS_BEFORE_VOIDED,
    });
    vi.mocked(voidInvoiceWithReason).mockResolvedValue(new Ok(invoice));

    const result = await voidFailedProCreditPurchaseInvoice({ auth, invoice });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.voided).toBe(true);
    }
    expect(voidInvoiceWithReason).toHaveBeenCalledWith(
      "in_to_void",
      "failed_upfront_pro_credit_purchase"
    );
  });

  it("should delete pending credit after voiding invoice", async () => {
    const invoice = makeCreditPurchaseInvoice({
      attempt_count: MAX_PRO_INVOICE_ATTEMPTS_BEFORE_VOIDED,
    });
    vi.mocked(voidInvoiceWithReason).mockResolvedValue(new Ok(invoice));

    await CreditResource.makeNew(auth, {
      type: "committed",
      initialAmountMicroUsd: 100_000_000,
      consumedAmountMicroUsd: 0,
      invoiceOrLineItemId: invoice.id,
    });

    const creditsBefore = await CreditResource.listAll(auth);
    expect(creditsBefore.length).toBe(1);

    await voidFailedProCreditPurchaseInvoice({ auth, invoice });

    const creditsAfter = await CreditResource.listAll(auth);
    expect(creditsAfter.length).toBe(0);
  });

  it("should return error if void operation fails", async () => {
    vi.mocked(voidInvoiceWithReason).mockResolvedValue(
      new Err(new Error("Stripe API error"))
    );

    const invoice = makeCreditPurchaseInvoice({
      attempt_count: MAX_PRO_INVOICE_ATTEMPTS_BEFORE_VOIDED,
    });

    const result = await voidFailedProCreditPurchaseInvoice({ auth, invoice });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Stripe API error");
    }
  });

  it("should still succeed when no credit exists for invoice", async () => {
    const invoice = makeCreditPurchaseInvoice({
      attempt_count: MAX_PRO_INVOICE_ATTEMPTS_BEFORE_VOIDED,
    });
    vi.mocked(voidInvoiceWithReason).mockResolvedValue(new Ok(invoice));

    const result = await voidFailedProCreditPurchaseInvoice({ auth, invoice });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.voided).toBe(true);
    }
  });
});

describe("createEnterpriseCreditPurchase", () => {
  let auth: Authenticator;
  const subscriptionId = "sub_enterprise_123";

  beforeEach(async () => {
    vi.clearAllMocks();

    const { authenticator } = await createResourceTest({ role: "admin" });
    auth = authenticator;
  });

  it("should create invoice with send_invoice collection method and N+30 days", async () => {
    vi.mocked(makeCreditPurchaseOneOffInvoice).mockResolvedValue(
      new Ok({ id: "in_enterprise" } as Stripe.Invoice)
    );
    vi.mocked(finalizeInvoice).mockResolvedValue(
      new Ok({ id: "in_enterprise" } as Stripe.Invoice)
    );

    await createEnterpriseCreditPurchase({
      auth,
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 5_000_000_000,
    });

    expect(makeCreditPurchaseOneOffInvoice).toHaveBeenCalledWith({
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 5_000_000_000,
      couponId: undefined,
      collectionMethod: "send_invoice",
      daysUntilDue: ENTERPRISE_N30_PAYMENTS_DAYS,
    });
  });

  it("should create coupon when discountPercent is provided", async () => {
    vi.mocked(getCreditPurchaseCouponId).mockResolvedValue(new Ok("coupon_15"));
    vi.mocked(makeCreditPurchaseOneOffInvoice).mockResolvedValue(
      new Ok({ id: "in_enterprise" } as Stripe.Invoice)
    );
    vi.mocked(finalizeInvoice).mockResolvedValue(
      new Ok({ id: "in_enterprise" } as Stripe.Invoice)
    );

    await createEnterpriseCreditPurchase({
      auth,
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 5_000_000_000,
      discountPercent: 15,
    });

    expect(getCreditPurchaseCouponId).toHaveBeenCalledWith(15);
    expect(makeCreditPurchaseOneOffInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ couponId: "coupon_15" })
    );
  });

  it("should create credit resource with correct type and amounts", async () => {
    vi.mocked(makeCreditPurchaseOneOffInvoice).mockResolvedValue(
      new Ok({ id: "in_enterprise" } as Stripe.Invoice)
    );
    vi.mocked(finalizeInvoice).mockResolvedValue(
      new Ok({ id: "in_enterprise" } as Stripe.Invoice)
    );

    const result = await createEnterpriseCreditPurchase({
      auth,
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 5_000_000_000,
      discountPercent: 10,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.credit.type).toBe("committed");
      expect(result.value.credit.initialAmountMicroUsd).toBe(5_000_000_000);
      expect(result.value.credit.discount).toBe(10);
      expect(result.value.invoiceOrLineItemId).toBe("in_enterprise");
    }
  });

  it("should finalize invoice after creation", async () => {
    const mockInvoice = { id: "in_enterprise" } as Stripe.Invoice;
    vi.mocked(makeCreditPurchaseOneOffInvoice).mockResolvedValue(
      new Ok(mockInvoice)
    );
    vi.mocked(finalizeInvoice).mockResolvedValue(new Ok(mockInvoice));

    await createEnterpriseCreditPurchase({
      auth,
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 5_000_000_000,
    });

    expect(finalizeInvoice).toHaveBeenCalledWith(mockInvoice);
  });

  it("should start credit immediately with custom dates", async () => {
    vi.mocked(makeCreditPurchaseOneOffInvoice).mockResolvedValue(
      new Ok({ id: "in_enterprise" } as Stripe.Invoice)
    );
    vi.mocked(finalizeInvoice).mockResolvedValue(
      new Ok({ id: "in_enterprise" } as Stripe.Invoice)
    );

    const startDate = new Date("2024-01-01");
    const expirationDate = new Date("2025-01-01");

    const result = await createEnterpriseCreditPurchase({
      auth,
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 5_000_000_000,
      startDate,
      expirationDate,
    });

    expect(result.isOk()).toBe(true);
    const credits = await CreditResource.listAll(auth);
    expect(credits[0].startDate?.getTime()).toBe(startDate.getTime());
    expect(credits[0].expirationDate?.getTime()).toBe(expirationDate.getTime());
  });

  it("should return error if coupon creation fails", async () => {
    vi.mocked(getCreditPurchaseCouponId).mockResolvedValue(
      new Err(new Error("Coupon API error"))
    );

    const result = await createEnterpriseCreditPurchase({
      auth,
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 5_000_000_000,
      discountPercent: 15,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Coupon API error");
    }
    expect(makeCreditPurchaseOneOffInvoice).not.toHaveBeenCalled();
  });

  it("should return error if invoice creation fails", async () => {
    vi.mocked(makeCreditPurchaseOneOffInvoice).mockResolvedValue(
      new Err({ error_type: "other", error_message: "Invoice creation failed" })
    );

    const result = await createEnterpriseCreditPurchase({
      auth,
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 5_000_000_000,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Invoice creation failed");
    }
  });

  it("should return error if finalize fails", async () => {
    vi.mocked(makeCreditPurchaseOneOffInvoice).mockResolvedValue(
      new Ok({ id: "in_enterprise" } as Stripe.Invoice)
    );
    vi.mocked(finalizeInvoice).mockResolvedValue(
      new Err({ error_type: "other", error_message: "Finalize failed" })
    );

    const result = await createEnterpriseCreditPurchase({
      auth,
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 5_000_000_000,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Finalize failed");
    }
  });
});

describe("createProCreditPurchase", () => {
  let auth: Authenticator;
  const subscriptionId = "sub_pro_123";

  beforeEach(async () => {
    vi.clearAllMocks();

    const { authenticator } = await createResourceTest({ role: "admin" });
    auth = authenticator;
  });

  it("should create invoice with charge_automatically collection method", async () => {
    vi.mocked(makeCreditPurchaseOneOffInvoice).mockResolvedValue(
      new Ok({ id: "in_pro" } as Stripe.Invoice)
    );
    vi.mocked(finalizeInvoice).mockResolvedValue(
      new Ok({ id: "in_pro" } as Stripe.Invoice)
    );
    vi.mocked(payInvoice).mockResolvedValue(new Ok({ paymentUrl: null }));

    await createProCreditPurchase({
      auth,
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 100_000_000,
    });

    expect(makeCreditPurchaseOneOffInvoice).toHaveBeenCalledWith({
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 100_000_000,
      couponId: undefined,
      collectionMethod: "charge_automatically",
      requestThreeDSecure: "challenge",
    });
  });

  it("should create coupon when discountPercent is provided", async () => {
    vi.mocked(getCreditPurchaseCouponId).mockResolvedValue(new Ok("coupon_20"));
    vi.mocked(makeCreditPurchaseOneOffInvoice).mockResolvedValue(
      new Ok({ id: "in_pro" } as Stripe.Invoice)
    );
    vi.mocked(finalizeInvoice).mockResolvedValue(
      new Ok({ id: "in_pro" } as Stripe.Invoice)
    );
    vi.mocked(payInvoice).mockResolvedValue(new Ok({ paymentUrl: null }));

    await createProCreditPurchase({
      auth,
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 100_000_000,
      discountPercent: 20,
    });

    expect(getCreditPurchaseCouponId).toHaveBeenCalledWith(20);
    expect(makeCreditPurchaseOneOffInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ couponId: "coupon_20" })
    );
  });

  it("should create credit resource before finalizing", async () => {
    vi.mocked(makeCreditPurchaseOneOffInvoice).mockResolvedValue(
      new Ok({ id: "in_pro" } as Stripe.Invoice)
    );
    vi.mocked(finalizeInvoice).mockResolvedValue(
      new Ok({ id: "in_pro" } as Stripe.Invoice)
    );
    vi.mocked(payInvoice).mockResolvedValue(new Ok({ paymentUrl: null }));

    await createProCreditPurchase({
      auth,
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 100_000_000,
    });

    const credits = await CreditResource.listAll(auth);
    expect(credits.length).toBe(1);
    expect(credits[0].type).toBe("committed");
    expect(credits[0].invoiceOrLineItemId).toBe("in_pro");
    expect(credits[0].startDate).toBeNull();
  });

  it("should finalize and pay invoice", async () => {
    const mockInvoice = { id: "in_pro" } as Stripe.Invoice;
    const mockFinalizedInvoice = {
      id: "in_pro",
      status: "open",
    } as Stripe.Invoice;
    vi.mocked(makeCreditPurchaseOneOffInvoice).mockResolvedValue(
      new Ok(mockInvoice)
    );
    vi.mocked(finalizeInvoice).mockResolvedValue(new Ok(mockFinalizedInvoice));
    vi.mocked(payInvoice).mockResolvedValue(new Ok({ paymentUrl: null }));

    await createProCreditPurchase({
      auth,
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 100_000_000,
    });

    expect(finalizeInvoice).toHaveBeenCalledWith(mockInvoice);
    expect(payInvoice).toHaveBeenCalledWith(mockFinalizedInvoice);
  });

  it("should return invoiceId and null paymentUrl on successful auto-charge", async () => {
    vi.mocked(makeCreditPurchaseOneOffInvoice).mockResolvedValue(
      new Ok({ id: "in_pro" } as Stripe.Invoice)
    );
    vi.mocked(finalizeInvoice).mockResolvedValue(
      new Ok({ id: "in_pro" } as Stripe.Invoice)
    );
    vi.mocked(payInvoice).mockResolvedValue(new Ok({ paymentUrl: null }));

    const result = await createProCreditPurchase({
      auth,
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 100_000_000,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.invoiceId).toBe("in_pro");
      expect(result.value.paymentUrl).toBeNull();
    }
  });

  it("should return paymentUrl when payment requires additional action (3DS)", async () => {
    vi.mocked(makeCreditPurchaseOneOffInvoice).mockResolvedValue(
      new Ok({ id: "in_pro" } as Stripe.Invoice)
    );
    vi.mocked(finalizeInvoice).mockResolvedValue(
      new Ok({ id: "in_pro" } as Stripe.Invoice)
    );
    vi.mocked(payInvoice).mockResolvedValue(
      new Ok({ paymentUrl: "https://checkout.stripe.com/3ds" })
    );

    const result = await createProCreditPurchase({
      auth,
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 100_000_000,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.paymentUrl).toBe("https://checkout.stripe.com/3ds");
    }
  });

  it("should return error if coupon creation fails", async () => {
    vi.mocked(getCreditPurchaseCouponId).mockResolvedValue(
      new Err(new Error("Coupon API error"))
    );

    const result = await createProCreditPurchase({
      auth,
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 100_000_000,
      discountPercent: 20,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Coupon API error");
    }
    expect(makeCreditPurchaseOneOffInvoice).not.toHaveBeenCalled();
  });

  it("should return error if invoice creation fails", async () => {
    vi.mocked(makeCreditPurchaseOneOffInvoice).mockResolvedValue(
      new Err({ error_type: "other", error_message: "Invoice creation failed" })
    );

    const result = await createProCreditPurchase({
      auth,
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 100_000_000,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Invoice creation failed");
    }
  });

  it("should return error if finalize fails", async () => {
    vi.mocked(makeCreditPurchaseOneOffInvoice).mockResolvedValue(
      new Ok({ id: "in_pro" } as Stripe.Invoice)
    );
    vi.mocked(finalizeInvoice).mockResolvedValue(
      new Err({ error_type: "other", error_message: "Finalize failed" })
    );

    const result = await createProCreditPurchase({
      auth,
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 100_000_000,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Finalize failed");
    }
  });

  it("should return error if pay fails", async () => {
    vi.mocked(makeCreditPurchaseOneOffInvoice).mockResolvedValue(
      new Ok({ id: "in_pro" } as Stripe.Invoice)
    );
    vi.mocked(finalizeInvoice).mockResolvedValue(
      new Ok({ id: "in_pro" } as Stripe.Invoice)
    );
    vi.mocked(payInvoice).mockResolvedValue(
      new Err({ error_type: "other", error_message: "Payment declined" })
    );

    const result = await createProCreditPurchase({
      auth,
      stripeSubscriptionId: subscriptionId,
      amountMicroUsd: 100_000_000,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Payment declined");
    }
  });
});

describe("deleteCreditFromVoidedInvoice", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { authenticator } = await createResourceTest({ role: "admin" });
    auth = authenticator;
  });

  it("should return credit_not_found when no credit exists for invoice", async () => {
    vi.mocked(isCreditPurchaseInvoice).mockReturnValue(true);

    const invoice = makeCreditPurchaseInvoice();

    const result = await deleteCreditFromVoidedInvoice({ auth, invoice });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("credit_not_found");
    }
  });

  it("should return credit_already_started when credit has started", async () => {
    vi.mocked(isCreditPurchaseInvoice).mockReturnValue(true);

    const invoice = makeCreditPurchaseInvoice();

    const credit = await CreditResource.makeNew(auth, {
      type: "committed",
      initialAmountMicroUsd: 100_000_000,
      consumedAmountMicroUsd: 0,
      invoiceOrLineItemId: invoice.id,
    });
    await credit.start(auth);

    const result = await deleteCreditFromVoidedInvoice({ auth, invoice });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("credit_already_started");
      if (result.error.type === "credit_already_started") {
        expect(result.error.credit.id).toBe(credit.id);
      }
    }
  });

  it("should delete credit and return Ok when credit is not started", async () => {
    vi.mocked(isCreditPurchaseInvoice).mockReturnValue(true);

    const invoice = makeCreditPurchaseInvoice();

    await CreditResource.makeNew(auth, {
      type: "committed",
      initialAmountMicroUsd: 100_000_000,
      consumedAmountMicroUsd: 0,
      invoiceOrLineItemId: invoice.id,
    });

    const creditsBefore = await CreditResource.listAll(auth);
    expect(creditsBefore.length).toBe(1);

    const result = await deleteCreditFromVoidedInvoice({ auth, invoice });

    expect(result.isOk()).toBe(true);

    const creditsAfter = await CreditResource.listAll(auth);
    expect(creditsAfter.length).toBe(0);
  });

  it("should throw when invoice is not a credit purchase invoice", async () => {
    vi.mocked(isCreditPurchaseInvoice).mockReturnValue(false);

    const invoice = makeCreditPurchaseInvoice();

    await expect(
      deleteCreditFromVoidedInvoice({ auth, invoice })
    ).rejects.toThrow(
      "deleteCreditFromVoidedInvoice called with non-credit-purchase invoice"
    );
  });
});
