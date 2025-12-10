import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Authenticator } from "@app/lib/auth";
import {
  allocatePAYGCreditsOnCycleRenewal,
  invoiceEnterprisePAYGCredits,
  isPAYGEnabled,
  startOrResumeEnterprisePAYG,
  stopEnterprisePAYG,
} from "@app/lib/credits/payg";
import {
  ENTERPRISE_N30_PAYMENTS_DAYS,
  isEnterpriseSubscription,
  makeAndFinalizeCreditsPAYGInvoice,
} from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Err, Ok } from "@app/types";

vi.mock("@app/lib/plans/stripe", async () => {
  const actual = await vi.importActual("@app/lib/plans/stripe");
  return {
    ...actual,
    isEnterpriseSubscription: vi.fn(),
    makeAndFinalizeCreditsPAYGInvoice: vi.fn(),
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
const NOW = 1700000000;
const NOW_MS = NOW * 1000;

function makeEnterpriseSubscription(
  overrides: Partial<Stripe.Subscription> = {}
): Stripe.Subscription {
  return {
    id: "sub_enterprise",
    current_period_start: NOW,
    current_period_end: NOW + MONTH_SECONDS,
    start_date: NOW - MONTH_SECONDS * 3,
    status: "active",
    customer: "cus_123",
    items: {
      data: [
        {
          price: {
            recurring: { interval: "month", interval_count: 1 },
            metadata: { REPORT_USAGE: "ENTERPRISE" },
          },
        },
      ],
      has_more: false,
      object: "list",
      url: "",
    },
    ...overrides,
  } as Stripe.Subscription;
}

describe("PAYG Credits Database Tests", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    const { authenticator } = await createResourceTest({
      role: "admin",
    });
    auth = authenticator;
  });

  // Requires migration_419.sql to be run (unique index on type, workspaceId, startDate, expirationDate)
  describe("unique constraint on (type, workspaceId, startDate, expirationDate)", () => {
    it("should throw when creating duplicate credits with same dates", async () => {
      const startTimestampSeconds = 1700000000;
      const endTimestampSeconds = 1702678400;
      const startDate = new Date(startTimestampSeconds * 1000);
      const expirationDate = new Date(endTimestampSeconds * 1000);

      const credit1 = await CreditResource.makeNew(auth, {
        type: "payg",
        initialAmountMicroUsd: 100_000_000,
        consumedAmountMicroUsd: 0,
      });
      await credit1.start(auth, {
        startDate,
        expirationDate,
      });

      const credit2 = await CreditResource.makeNew(auth, {
        type: "payg",
        initialAmountMicroUsd: 200_000_000,
        consumedAmountMicroUsd: 0,
      });

      await expect(
        credit2.start(auth, {
          startDate,
          expirationDate,
        })
      ).rejects.toThrow(/unique|Validation error/i);
    });
  });

  describe("timestamp precision", () => {
    it("should find credit by exact timestamp seconds", async () => {
      const startTimestampSeconds = 1700000000;
      const endTimestampSeconds = 1702678400;
      const startDate = new Date(startTimestampSeconds * 1000);
      const expirationDate = new Date(endTimestampSeconds * 1000);

      const credit = await CreditResource.makeNew(auth, {
        type: "payg",
        initialAmountMicroUsd: 100_000_000,
        consumedAmountMicroUsd: 0,
      });
      await credit.start(auth, {
        startDate,
        expirationDate,
      });

      const lookupStartDate = new Date(startTimestampSeconds * 1000);
      const lookupExpirationDate = new Date(endTimestampSeconds * 1000);

      const found = await CreditResource.fetchByTypeAndDates(
        auth,
        "payg",
        lookupStartDate,
        lookupExpirationDate
      );

      expect(found).not.toBeNull();
      expect(found?.id).toBe(credit.id);
    });
  });
});

describe("isPAYGEnabled", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { authenticator } = await createResourceTest({ role: "admin" });
    auth = authenticator;
  });

  it("should return false when no programmatic config exists", async () => {
    const result = await isPAYGEnabled(auth);
    expect(result).toBe(false);
  });

  it("should return false when paygCapCents is null", async () => {
    await ProgrammaticUsageConfigurationResource.makeNew(auth, {
      freeCreditMicroUsd: null,
      defaultDiscountPercent: 0,
      paygCapMicroUsd: null,
    });

    const result = await isPAYGEnabled(auth);
    expect(result).toBe(false);
  });

  it("should return true when paygCapCents is set", async () => {
    await ProgrammaticUsageConfigurationResource.makeNew(auth, {
      freeCreditMicroUsd: null,
      defaultDiscountPercent: 0,
      paygCapMicroUsd: 1_000_000_000,
    });

    const result = await isPAYGEnabled(auth);
    expect(result).toBe(true);
  });
});

describe("allocatePAYGCreditsOnCycleRenewal", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
    const { authenticator } = await createResourceTest({
      role: "admin",
    });
    auth = authenticator;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should do nothing when no programmatic config exists", async () => {
    await allocatePAYGCreditsOnCycleRenewal({
      auth,
      nextPeriodStartSeconds: NOW,
      nextPeriodEndSeconds: NOW + MONTH_SECONDS,
    });

    const credits = await CreditResource.listAll(auth);
    expect(credits.length).toBe(0);
  });

  it("should do nothing when paygCapCents is null", async () => {
    await ProgrammaticUsageConfigurationResource.makeNew(auth, {
      freeCreditMicroUsd: null,
      defaultDiscountPercent: 0,
      paygCapMicroUsd: null,
    });

    await allocatePAYGCreditsOnCycleRenewal({
      auth,
      nextPeriodStartSeconds: NOW,
      nextPeriodEndSeconds: NOW + MONTH_SECONDS,
    });

    const credits = await CreditResource.listAll(auth);
    expect(credits.length).toBe(0);
  });

  it("should skip allocation when credit already exists for the period", async () => {
    await ProgrammaticUsageConfigurationResource.makeNew(auth, {
      freeCreditMicroUsd: null,
      defaultDiscountPercent: 0,
      paygCapMicroUsd: 500_000_000,
    });

    const existingCredit = await CreditResource.makeNew(auth, {
      type: "payg",
      initialAmountMicroUsd: 500_000_000,
      consumedAmountMicroUsd: 0,
    });
    await existingCredit.start(auth, {
      startDate: new Date(NOW * 1000),
      expirationDate: new Date((NOW + MONTH_SECONDS) * 1000),
    });

    await allocatePAYGCreditsOnCycleRenewal({
      auth,
      nextPeriodStartSeconds: NOW,
      nextPeriodEndSeconds: NOW + MONTH_SECONDS,
    });

    const credits = await CreditResource.listAll(auth);
    expect(credits.length).toBe(1);
  });

  it("should create new PAYG credit with correct dates and amounts", async () => {
    await ProgrammaticUsageConfigurationResource.makeNew(auth, {
      freeCreditMicroUsd: null,
      defaultDiscountPercent: 10,
      paygCapMicroUsd: 750_000_000,
    });

    await allocatePAYGCreditsOnCycleRenewal({
      auth,
      nextPeriodStartSeconds: NOW,
      nextPeriodEndSeconds: NOW + MONTH_SECONDS,
    });

    const credits = await CreditResource.listAll(auth);
    expect(credits.length).toBe(1);
    expect(credits[0].type).toBe("payg");
    expect(credits[0].initialAmountMicroUsd).toBe(750_000_000);
    expect(credits[0].startDate?.getTime()).toBe(NOW * 1000);
    expect(credits[0].expirationDate?.getTime()).toBe(
      (NOW + MONTH_SECONDS) * 1000
    );
  });

  it("should apply discount from config when creating credit", async () => {
    await ProgrammaticUsageConfigurationResource.makeNew(auth, {
      freeCreditMicroUsd: null,
      defaultDiscountPercent: 20,
      paygCapMicroUsd: 1_000_000_000,
    });

    await allocatePAYGCreditsOnCycleRenewal({
      auth,
      nextPeriodStartSeconds: NOW,
      nextPeriodEndSeconds: NOW + MONTH_SECONDS,
    });

    const credits = await CreditResource.listAll(auth);
    expect(credits[0].discount).toBe(20);
  });
});

describe("startOrResumeEnterprisePAYG", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
    const { authenticator } = await createResourceTest({
      role: "admin",
    });
    auth = authenticator;
    vi.mocked(isEnterpriseSubscription).mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should throw when called with non-enterprise subscription", async () => {
    vi.mocked(isEnterpriseSubscription).mockReturnValue(false);
    const subscription = makeEnterpriseSubscription();

    await expect(
      startOrResumeEnterprisePAYG({
        auth,
        stripeSubscription: subscription,
        paygCapMicroUsd: 1_000_000_000,
      })
    ).rejects.toThrow();
  });

  it("should return error when programmatic config does not exist", async () => {
    const subscription = makeEnterpriseSubscription();

    const result = await startOrResumeEnterprisePAYG({
      auth,
      stripeSubscription: subscription,
      paygCapMicroUsd: 1_000_000_000,
    });

    expect(result.isErr()).toBe(true);
  });

  it("should update config paygCapCents successfully", async () => {
    await ProgrammaticUsageConfigurationResource.makeNew(auth, {
      freeCreditMicroUsd: null,
      defaultDiscountPercent: 0,
      paygCapMicroUsd: null,
    });
    const subscription = makeEnterpriseSubscription();

    const result = await startOrResumeEnterprisePAYG({
      auth,
      stripeSubscription: subscription,
      paygCapMicroUsd: 1_500_000_000,
    });

    expect(result.isOk()).toBe(true);
    const config =
      await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
    expect(config?.paygCapMicroUsd).toBe(1_500_000_000);
  });

  it("should create credit for current billing period with correct dates", async () => {
    await ProgrammaticUsageConfigurationResource.makeNew(auth, {
      freeCreditMicroUsd: null,
      defaultDiscountPercent: 15,
      paygCapMicroUsd: null,
    });
    const subscription = makeEnterpriseSubscription();

    await startOrResumeEnterprisePAYG({
      auth,
      stripeSubscription: subscription,
      paygCapMicroUsd: 2_000_000_000,
    });

    const credits = await CreditResource.listAll(auth);
    expect(credits.length).toBe(1);
    expect(credits[0].startDate?.getTime()).toBe(
      subscription.current_period_start * 1000
    );
    expect(credits[0].expirationDate?.getTime()).toBe(
      subscription.current_period_end * 1000
    );

    const config =
      await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
    expect(config?.paygCapMicroUsd).toBe(2_000_000_000);
  });

  it("should update credit if credit already exists for period", async () => {
    await ProgrammaticUsageConfigurationResource.makeNew(auth, {
      freeCreditMicroUsd: null,
      defaultDiscountPercent: 0,
      paygCapMicroUsd: null,
    });
    const subscription = makeEnterpriseSubscription();

    const existingCredit = await CreditResource.makeNew(auth, {
      type: "payg",
      initialAmountMicroUsd: 500_000_000,
      consumedAmountMicroUsd: 0,
    });
    await existingCredit.start(auth, {
      startDate: new Date(subscription.current_period_start * 1000),
      expirationDate: new Date(subscription.current_period_end * 1000),
    });

    await startOrResumeEnterprisePAYG({
      auth,
      stripeSubscription: subscription,
      paygCapMicroUsd: 1_000_000_000,
    });

    const credits = await CreditResource.listAll(auth);
    expect(credits.length).toBe(1);
    expect(credits[0].initialAmountMicroUsd).toBe(1_000_000_000);
  });
});

describe("stopEnterprisePAYG", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
    const { authenticator } = await createResourceTest({
      role: "admin",
    });
    auth = authenticator;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should freeze existing PAYG credit for current period", async () => {
    const subscription = makeEnterpriseSubscription();
    const credit = await CreditResource.makeNew(auth, {
      type: "payg",
      initialAmountMicroUsd: 1_000_000_000,
      consumedAmountMicroUsd: 50_000_000,
    });
    await credit.start(auth, {
      startDate: new Date(subscription.current_period_start * 1000),
      expirationDate: new Date(subscription.current_period_end * 1000),
    });

    const result = await stopEnterprisePAYG({
      auth,
      stripeSubscription: subscription,
    });

    expect(result.isOk()).toBe(true);
    const credits = await CreditResource.listAll(auth);
    expect(credits[0].initialAmountMicroUsd).toBe(
      credits[0].consumedAmountMicroUsd
    );
  });

  it("should handle case when no PAYG credit exists for period", async () => {
    const subscription = makeEnterpriseSubscription();

    const result = await stopEnterprisePAYG({
      auth,
      stripeSubscription: subscription,
    });

    expect(result.isOk()).toBe(true);
  });

  it("should set paygCapCents to null in config", async () => {
    await ProgrammaticUsageConfigurationResource.makeNew(auth, {
      freeCreditMicroUsd: null,
      defaultDiscountPercent: 10,
      paygCapMicroUsd: 1_000_000_000,
    });
    const subscription = makeEnterpriseSubscription();

    await stopEnterprisePAYG({
      auth,
      stripeSubscription: subscription,
    });

    const config =
      await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
    expect(config?.paygCapMicroUsd).toBeNull();
  });

  it("should succeed even when no config exists", async () => {
    const subscription = makeEnterpriseSubscription();

    const result = await stopEnterprisePAYG({
      auth,
      stripeSubscription: subscription,
    });

    expect(result.isOk()).toBe(true);
  });
});

describe("invoiceEnterprisePAYGCredits", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
    const { authenticator } = await createResourceTest({
      role: "admin",
    });
    auth = authenticator;
    vi.mocked(isEnterpriseSubscription).mockReturnValue(true);
    vi.mocked(makeAndFinalizeCreditsPAYGInvoice).mockResolvedValue(
      new Ok({ id: "inv_test" } as Stripe.Invoice)
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should throw when subscription is not enterprise", async () => {
    vi.mocked(isEnterpriseSubscription).mockReturnValue(false);
    await ProgrammaticUsageConfigurationResource.makeNew(auth, {
      freeCreditMicroUsd: null,
      defaultDiscountPercent: 0,
      paygCapMicroUsd: 1_000_000_000,
    });

    const subscription = makeEnterpriseSubscription();
    const previousStart = NOW - MONTH_SECONDS;
    const previousEnd = NOW;

    await expect(
      invoiceEnterprisePAYGCredits({
        auth,
        stripeSubscription: subscription,
        previousPeriodStartSeconds: previousStart,
        previousPeriodEndSeconds: previousEnd,
      })
    ).rejects.toThrow();
  });

  it("should throw when PAYG is not enabled", async () => {
    const subscription = makeEnterpriseSubscription();
    const previousStart = NOW - MONTH_SECONDS;
    const previousEnd = NOW;

    await expect(
      invoiceEnterprisePAYGCredits({
        auth,
        stripeSubscription: subscription,
        previousPeriodStartSeconds: previousStart,
        previousPeriodEndSeconds: previousEnd,
      })
    ).rejects.toThrow();
  });

  it("should throw when no credit exists for the period", async () => {
    await ProgrammaticUsageConfigurationResource.makeNew(auth, {
      freeCreditMicroUsd: null,
      defaultDiscountPercent: 0,
      paygCapMicroUsd: 1_000_000_000,
    });

    const subscription = makeEnterpriseSubscription();
    const previousStart = NOW - MONTH_SECONDS;
    const previousEnd = NOW;

    await expect(
      invoiceEnterprisePAYGCredits({
        auth,
        stripeSubscription: subscription,
        previousPeriodStartSeconds: previousStart,
        previousPeriodEndSeconds: previousEnd,
      })
    ).rejects.toThrow();
  });

  it("should skip invoicing when consumed amount is zero", async () => {
    await ProgrammaticUsageConfigurationResource.makeNew(auth, {
      freeCreditMicroUsd: null,
      defaultDiscountPercent: 0,
      paygCapMicroUsd: 1_000_000_000,
    });

    const previousStart = NOW - MONTH_SECONDS;
    const previousEnd = NOW;

    const credit = await CreditResource.makeNew(auth, {
      type: "payg",
      initialAmountMicroUsd: 100_000_000,
      consumedAmountMicroUsd: 0,
    });
    await credit.start(auth, {
      startDate: new Date(previousStart * 1000),
      expirationDate: new Date(previousEnd * 1000),
    });

    const subscription = makeEnterpriseSubscription();

    const result = await invoiceEnterprisePAYGCredits({
      auth,
      stripeSubscription: subscription,
      previousPeriodStartSeconds: previousStart,
      previousPeriodEndSeconds: previousEnd,
    });

    expect(result.isOk()).toBe(true);
    expect(makeAndFinalizeCreditsPAYGInvoice).not.toHaveBeenCalled();
  });

  it("should create invoice with correct amount and period dates", async () => {
    await ProgrammaticUsageConfigurationResource.makeNew(auth, {
      freeCreditMicroUsd: null,
      defaultDiscountPercent: 0,
      paygCapMicroUsd: 1_000_000_000,
    });

    const previousStart = NOW - MONTH_SECONDS;
    const previousEnd = NOW;

    const credit = await CreditResource.makeNew(auth, {
      type: "payg",
      initialAmountMicroUsd: 1_000_000_000,
      consumedAmountMicroUsd: 150_000_000,
    });
    await credit.start(auth, {
      startDate: new Date(previousStart * 1000),
      expirationDate: new Date(previousEnd * 1000),
    });

    const subscription = makeEnterpriseSubscription();

    await invoiceEnterprisePAYGCredits({
      auth,
      stripeSubscription: subscription,
      previousPeriodStartSeconds: previousStart,
      previousPeriodEndSeconds: previousEnd,
    });

    expect(makeAndFinalizeCreditsPAYGInvoice).toHaveBeenCalledWith({
      stripeSubscription: subscription,
      amountMicroUsd: 150_000_000,
      periodStartSeconds: previousStart,
      periodEndSeconds: previousEnd,
      idempotencyKey: expect.stringMatching(
        `credits-payg-arrears-${credit.sId}`
      ),
      daysUntilDue: ENTERPRISE_N30_PAYMENTS_DAYS,
    });
  });

  it("should pass correct idempotency key to makeCreditsPAYGInvoice", async () => {
    await ProgrammaticUsageConfigurationResource.makeNew(auth, {
      freeCreditMicroUsd: null,
      defaultDiscountPercent: 0,
      paygCapMicroUsd: 1_000_000_000,
    });

    const previousStart = NOW - MONTH_SECONDS;
    const previousEnd = NOW;

    const credit = await CreditResource.makeNew(auth, {
      type: "payg",
      initialAmountMicroUsd: 100_000_000,
      consumedAmountMicroUsd: 5_000_000,
    });
    await credit.start(auth, {
      startDate: new Date(previousStart * 1000),
      expirationDate: new Date(previousEnd * 1000),
    });

    const subscription = makeEnterpriseSubscription();

    await invoiceEnterprisePAYGCredits({
      auth,
      stripeSubscription: subscription,
      previousPeriodStartSeconds: previousStart,
      previousPeriodEndSeconds: previousEnd,
    });

    expect(makeAndFinalizeCreditsPAYGInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `credits-payg-arrears-${credit.sId}`,
      })
    );
  });

  it("should handle idempotency errors gracefully", async () => {
    vi.mocked(makeAndFinalizeCreditsPAYGInvoice).mockResolvedValue(
      new Err({ error_type: "idempotency", error_message: "Already created" })
    );

    await ProgrammaticUsageConfigurationResource.makeNew(auth, {
      freeCreditMicroUsd: null,
      defaultDiscountPercent: 0,
      paygCapMicroUsd: 1_000_000_000,
    });

    const previousStart = NOW - MONTH_SECONDS;
    const previousEnd = NOW;

    const credit = await CreditResource.makeNew(auth, {
      type: "payg",
      initialAmountMicroUsd: 1_000_000_000,
      consumedAmountMicroUsd: 50_000_000,
    });
    await credit.start(auth, {
      startDate: new Date(previousStart * 1000),
      expirationDate: new Date(previousEnd * 1000),
    });

    const subscription = makeEnterpriseSubscription();

    const result = await invoiceEnterprisePAYGCredits({
      auth,
      stripeSubscription: subscription,
      previousPeriodStartSeconds: previousStart,
      previousPeriodEndSeconds: previousEnd,
    });

    expect(result.isErr()).toBe(true);
  });

  it("should mark credit as paid after successful invoice creation", async () => {
    await ProgrammaticUsageConfigurationResource.makeNew(auth, {
      freeCreditMicroUsd: null,
      defaultDiscountPercent: 0,
      paygCapMicroUsd: 1_000_000_000,
    });

    const previousStart = NOW - MONTH_SECONDS;
    const previousEnd = NOW;

    const credit = await CreditResource.makeNew(auth, {
      type: "payg",
      initialAmountMicroUsd: 100_000_000,
      consumedAmountMicroUsd: 25_000_000,
    });
    await credit.start(auth, {
      startDate: new Date(previousStart * 1000),
      expirationDate: new Date(previousEnd * 1000),
    });

    const subscription = makeEnterpriseSubscription();

    await invoiceEnterprisePAYGCredits({
      auth,
      stripeSubscription: subscription,
      previousPeriodStartSeconds: previousStart,
      previousPeriodEndSeconds: previousEnd,
    });

    const credits = await CreditResource.listAll(auth);
    expect(credits[0].invoiceOrLineItemId).toBe("inv_test");
  });

  it("should return error on invoice creation failure", async () => {
    vi.mocked(makeAndFinalizeCreditsPAYGInvoice).mockResolvedValue(
      new Err({ error_type: "other", error_message: "Stripe error" })
    );

    await ProgrammaticUsageConfigurationResource.makeNew(auth, {
      freeCreditMicroUsd: null,
      defaultDiscountPercent: 0,
      paygCapMicroUsd: 1_000_000_000,
    });

    const previousStart = NOW - MONTH_SECONDS;
    const previousEnd = NOW;

    const credit = await CreditResource.makeNew(auth, {
      type: "payg",
      initialAmountMicroUsd: 100_000_000,
      consumedAmountMicroUsd: 10_000_000,
    });
    await credit.start(auth, {
      startDate: new Date(previousStart * 1000),
      expirationDate: new Date(previousEnd * 1000),
    });

    const subscription = makeEnterpriseSubscription();

    const result = await invoiceEnterprisePAYGCredits({
      auth,
      stripeSubscription: subscription,
      previousPeriodStartSeconds: previousStart,
      previousPeriodEndSeconds: previousEnd,
    });

    expect(result.isErr()).toBe(true);
  });
});
