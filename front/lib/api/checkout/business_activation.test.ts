import {
  createPaymentGatedBusinessActivation,
  handleSubscriptionActivationFailure,
  handleSubscriptionActivationSuccess,
} from "@app/lib/api/checkout/business_activation";
import { ensureWorkOSOrganizationForPaidPlan } from "@app/lib/api/workos/organization";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSetCheckoutPaymentPending,
  mockGetCheckoutPaymentStatus,
  mockMarkCheckoutPaymentSucceeded,
  mockMarkCheckoutPaymentFailed,
  mockRecordCheckoutPaymentSyncFailure,
  mockSwapMetronomeContract,
  mockFetchActiveSubscription,
  mockEnsureMetronomeCustomer,
  mockProvisionActivationContract,
  mockScheduleContractEnd,
  mockAddPaymentGatedCommit,
  mockUpdateMembershipSeat,
  mockRestoreWorkspace,
  mockInvalidateCache,
  mockFetchUser,
} = vi.hoisted(() => ({
  mockSetCheckoutPaymentPending: vi.fn(),
  mockGetCheckoutPaymentStatus: vi.fn(),
  mockMarkCheckoutPaymentSucceeded: vi.fn(),
  mockMarkCheckoutPaymentFailed: vi.fn(),
  mockRecordCheckoutPaymentSyncFailure: vi.fn(),
  mockSwapMetronomeContract: vi.fn(),
  mockFetchActiveSubscription: vi.fn(),
  mockEnsureMetronomeCustomer: vi.fn(),
  mockProvisionActivationContract: vi.fn(),
  mockScheduleContractEnd: vi.fn(),
  mockAddPaymentGatedCommit: vi.fn(),
  mockUpdateMembershipSeat: vi.fn(),
  mockRestoreWorkspace: vi.fn(),
  mockInvalidateCache: vi.fn(),
  mockFetchUser: vi.fn(),
}));

vi.mock("@app/lib/credits/checkout_payment_status", () => ({
  setCheckoutPaymentPending: mockSetCheckoutPaymentPending,
  getCheckoutPaymentStatus: mockGetCheckoutPaymentStatus,
  markCheckoutPaymentSucceeded: mockMarkCheckoutPaymentSucceeded,
  markCheckoutPaymentFailed: mockMarkCheckoutPaymentFailed,
  recordCheckoutPaymentSyncFailure: mockRecordCheckoutPaymentSyncFailure,
}));

vi.mock("@app/lib/metronome/client", () => ({
  floorToHourISO: (d: Date) => d.toISOString(),
  scheduleMetronomeContractEnd: mockScheduleContractEnd,
  addPaymentGatedCommitToContract: mockAddPaymentGatedCommit,
  getMetronomeClient: vi.fn(),
}));

vi.mock("@app/lib/metronome/contracts", () => ({
  ensureMetronomeCustomerForWorkspace: mockEnsureMetronomeCustomer,
  provisionPaymentGatedActivationContract: mockProvisionActivationContract,
}));

vi.mock("@app/lib/resources/subscription_resource", () => ({
  SubscriptionResource: {
    fetchActiveByWorkspaceModelId: mockFetchActiveSubscription,
  },
}));

vi.mock("@app/lib/resources/user_resource", () => ({
  UserResource: {
    fetchById: mockFetchUser,
  },
}));

vi.mock("@app/lib/resources/coupon_resource", () => ({
  CouponResource: {
    findByCode: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@app/lib/resources/coupon_redemption_resource", () => ({
  CouponRedemptionResource: {
    findActiveOrPendingByCouponAndWorkspace: vi.fn().mockResolvedValue(null),
    fetchById: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@app/lib/api/membership", () => ({
  updateMembershipSeatAndTrack: mockUpdateMembershipSeat,
}));

vi.mock("@app/lib/api/subscription", () => ({
  isMetronomeBillingEnabled: vi.fn().mockResolvedValue(true),
  restoreWorkspaceAfterSubscription: mockRestoreWorkspace,
}));

vi.mock("@app/lib/metronome/plan_type", () => ({
  invalidateContractCache: mockInvalidateCache,
}));

vi.mock("@app/lib/auth", () => ({
  Authenticator: {
    internalAdminForWorkspace: vi.fn().mockResolvedValue({
      getNonNullableWorkspace: () => ({
        sId: "w_test",
        name: "Test Workspace",
      }),
    }),
    fromUserIdAndWorkspaceId: vi.fn().mockResolvedValue({
      getNonNullableWorkspace: () => ({
        sId: "w_test",
        name: "Test Workspace",
      }),
    }),
  },
}));

vi.mock("@app/lib/metronome/audit", () => ({
  emitSubscriptionChangedAuditEvent: vi.fn(),
}));

vi.mock("@app/lib/api/workos/organization", () => ({
  ensureWorkOSOrganizationForPaidPlan: vi.fn(),
}));

vi.mock("@app/lib/workspace", () => ({
  renderLightWorkspaceType: ({
    workspace,
  }: {
    workspace: { sId: string };
  }) => ({
    sId: workspace.sId,
    name: "Test Workspace",
  }),
}));

vi.mock("@app/lib/plans/billing_currency", () => ({
  getBillingCurrencyForCountry: vi.fn().mockReturnValue("usd"),
  resolvePackageAliasForCurrency: vi
    .fn()
    .mockImplementation((alias: string) => alias),
}));

vi.mock("@app/lib/plans/plan_codes", () => ({
  CREDIT_PRICED_BUSINESS_PLAN_CODE: "CP_BUSINESS_PLAN",
  isFreePlan: (code: string) =>
    code === "CP_FREE_PLAN" || code === "FREE_NO_PLAN",
}));

vi.mock("@app/lib/metronome/constants", () => ({
  PAYMENT_GATE_TYPE_CUSTOM_FIELD_KEY: "DUST_PAYMENT_GATE_TYPE",
  PAYMENT_GATE_TYPE_SUBSCRIPTION_ACTIVATION: "subscription_activation",
  CURRENCY_TO_CREDIT_TYPE_ID: { usd: "usd-credit", eur: "eur-credit" },
  FOREVER_ENDING_BEFORE: "9999-12-31T00:00:00.000Z",
  CARRY_ON_RENEWAL_CUSTOM_FIELD_KEY: "CARRY_ON_RENEWAL",
  CARRY_ON_RENEWAL_FOREVER_VALUE: "forever",
  SEAT_PRIORITY_SUBSCRIPTION_COMMIT: 100,
  getProductSeatSubscriptionCommitId: () => "seat-commit-product",
}));

vi.mock("@app/lib/metronome/amounts", () => ({
  metronomeAmount: vi.fn().mockImplementation((cents: number) => cents),
}));

vi.mock("@app/lib/metronome/coupons", () => ({
  createCouponCredit: vi.fn(),
  getCreditTypeFromPackage: vi.fn(),
}));

vi.mock("@app/lib/metronome/setup_common", () => ({
  SEAT_TAG: "seat",
}));

vi.mock("@app/lib/plans/stripe", () => ({
  getStripeClient: vi.fn(),
  setStripeCustomerDefaultPaymentMethod: vi.fn(),
}));

vi.mock("@app/logger/logger", () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return { default: logger };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WORKSPACE = {
  sId: "w_test",
  id: 1,
  metronomeCustomerId: "m-customer",
  name: "Test Workspace",
} as unknown as WorkspaceResource;

const FREE_SUBSCRIPTION = {
  sId: "sub_free",
  metronomeContractId: "previous-contract-id",
  getPlan: () => ({ code: "CP_FREE_PLAN" }),
  swapMetronomeContract: mockSwapMetronomeContract,
};

const CHECKOUT_PAYMENT_PENDING = {
  status: "pending" as const,
  workspaceId: "w_test",
  metronomeCustomerId: "m-customer",
  contractId: "activation-contract-id",
  userId: "user_test",
  targetUserId: "target_user",
  seatType: "pro" as const,
  billingPeriod: "monthly" as const,
  currency: "usd" as const,
  initialAmountCents: 3000,
  metronomePackageAlias: "business-usd",
  planCode: "CP_BUSINESS_PLAN",
  uniquenessKey: "key",
  createdAtMs: 1000000,
  previousMetronomeContractId: "previous-contract-id",
};

function makeActivationInput() {
  return {
    workspace: WORKSPACE,
    stripeCustomerId: "cus_test",
    setupSessionId: "setup_test",
    targetUserId: "target_user",
    seatType: "pro" as const,
    billingPeriod: "monthly" as const,
    currency: "usd" as const,
    pricePerSeatCents: 3000,
    metronomePackageAlias: "business-usd",
    userId: "user_test",
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mockFetchActiveSubscription.mockResolvedValue(FREE_SUBSCRIPTION);
  mockEnsureMetronomeCustomer.mockResolvedValue(
    new Ok({ metronomeCustomerId: "m-customer" })
  );
  mockProvisionActivationContract.mockResolvedValue(
    new Ok({ metronomeContractId: "activation-contract-id" })
  );
  mockSetCheckoutPaymentPending.mockResolvedValue(undefined);
  mockAddPaymentGatedCommit.mockResolvedValue(new Ok({ editId: "edit_1" }));
  mockScheduleContractEnd.mockResolvedValue(new Ok(undefined));
  mockGetCheckoutPaymentStatus.mockResolvedValue(CHECKOUT_PAYMENT_PENDING);
  mockMarkCheckoutPaymentSucceeded.mockResolvedValue(undefined);
  mockMarkCheckoutPaymentFailed.mockResolvedValue(undefined);
  mockRecordCheckoutPaymentSyncFailure.mockResolvedValue(undefined);
  mockSwapMetronomeContract.mockResolvedValue(undefined);
  mockInvalidateCache.mockResolvedValue(undefined);
  mockFetchUser.mockResolvedValue({ sId: "target_user" });
  mockUpdateMembershipSeat.mockResolvedValue(new Ok(undefined));
  mockRestoreWorkspace.mockResolvedValue(undefined);
  vi.mocked(ensureWorkOSOrganizationForPaidPlan).mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// createPaymentGatedBusinessActivation
// ---------------------------------------------------------------------------

describe("createPaymentGatedBusinessActivation", () => {
  it("stores previous subscription snapshot in Redis pending state", async () => {
    const result = await createPaymentGatedBusinessActivation(
      makeActivationInput()
    );

    expect(result.isOk()).toBe(true);
    expect(mockSetCheckoutPaymentPending).toHaveBeenCalledWith(
      expect.objectContaining({
        previousMetronomeContractId: "previous-contract-id",
      })
    );
  });

  it("does not end the previous contract during checkout creation", async () => {
    await createPaymentGatedBusinessActivation(makeActivationInput());

    expect(mockScheduleContractEnd).not.toHaveBeenCalled();
  });

  it("ends only the activation contract when commit creation fails", async () => {
    mockAddPaymentGatedCommit.mockResolvedValue(
      new Err(new Error("commit failed"))
    );

    const result = await createPaymentGatedBusinessActivation(
      makeActivationInput()
    );

    expect(result.isErr()).toBe(true);
    expect(mockScheduleContractEnd).toHaveBeenCalledTimes(1);
    expect(mockScheduleContractEnd).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: "activation-contract-id" })
    );
    expect(mockScheduleContractEnd).not.toHaveBeenCalledWith(
      expect.objectContaining({ contractId: "previous-contract-id" })
    );
  });
});

// ---------------------------------------------------------------------------
// handleSubscriptionActivationSuccess
// ---------------------------------------------------------------------------

describe("handleSubscriptionActivationSuccess", () => {
  it("swaps to activation contract, updates seat, ends previous contract", async () => {
    mockFetchActiveSubscription.mockResolvedValue({
      sId: "sub_free",
      metronomeContractId: "previous-contract-id",
      getPlan: () => ({ code: "CP_FREE_PLAN" }),
      swapMetronomeContract: mockSwapMetronomeContract,
    });

    await handleSubscriptionActivationSuccess({
      workspace: WORKSPACE,
      contractId: "activation-contract-id",
      invoiceId: "inv_123",
    });

    expect(mockSwapMetronomeContract).toHaveBeenCalledWith({
      metronomeContractId: "activation-contract-id",
      planCode: "CP_BUSINESS_PLAN",
    });
    expect(mockUpdateMembershipSeat).toHaveBeenCalled();
    expect(mockMarkCheckoutPaymentSucceeded).toHaveBeenCalledWith({
      workspaceId: "w_test",
      contractId: "activation-contract-id",
      invoiceId: "inv_123",
    });
    expect(mockScheduleContractEnd).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: "previous-contract-id" })
    );
    expect(mockScheduleContractEnd).not.toHaveBeenCalledWith(
      expect.objectContaining({ contractId: "activation-contract-id" })
    );
  });

  it("is idempotent when Redis status is already succeeded", async () => {
    mockGetCheckoutPaymentStatus.mockResolvedValue({
      ...CHECKOUT_PAYMENT_PENDING,
      status: "succeeded",
    });

    await handleSubscriptionActivationSuccess({
      workspace: WORKSPACE,
      contractId: "activation-contract-id",
      invoiceId: "inv_123",
    });

    expect(mockSwapMetronomeContract).not.toHaveBeenCalled();
    expect(mockScheduleContractEnd).not.toHaveBeenCalled();
    expect(mockMarkCheckoutPaymentSucceeded).not.toHaveBeenCalled();
  });

  it("marks failed and ends activation contract when active subscription has changed", async () => {
    mockFetchActiveSubscription.mockResolvedValue({
      sId: "sub_different",
      metronomeContractId: "different-contract-id",
      getPlan: () => ({ code: "CP_BUSINESS_PLAN" }),
      swapMetronomeContract: mockSwapMetronomeContract,
    });

    await handleSubscriptionActivationSuccess({
      workspace: WORKSPACE,
      contractId: "activation-contract-id",
      invoiceId: "inv_123",
    });

    expect(mockSwapMetronomeContract).not.toHaveBeenCalled();
    expect(mockScheduleContractEnd).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: "activation-contract-id" })
    );
    expect(mockScheduleContractEnd).not.toHaveBeenCalledWith(
      expect.objectContaining({ contractId: "different-contract-id" })
    );
    expect(mockMarkCheckoutPaymentFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w_test",
        contractId: "activation-contract-id",
      })
    );
  });
});

// ---------------------------------------------------------------------------
// handleSubscriptionActivationFailure
// ---------------------------------------------------------------------------

describe("handleSubscriptionActivationFailure", () => {
  it("ends only the activation contract, not the previous free contract", async () => {
    await handleSubscriptionActivationFailure({
      workspace: WORKSPACE,
      contractId: "activation-contract-id",
      invoiceId: "inv_123",
      errorMessage: "Payment declined",
    });

    expect(mockMarkCheckoutPaymentFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w_test",
        contractId: "activation-contract-id",
        errorMessage: "Payment declined",
      })
    );
    expect(mockScheduleContractEnd).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: "activation-contract-id" })
    );
    expect(mockScheduleContractEnd).not.toHaveBeenCalledWith(
      expect.objectContaining({ contractId: "previous-contract-id" })
    );
    expect(mockSwapMetronomeContract).not.toHaveBeenCalled();
  });
});
