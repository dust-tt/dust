import {
  provisionMetronomeContract,
  provisionPaymentGatedActivationContract,
  resolveCurrencyForExistingMetronomeCustomer,
} from "@app/lib/metronome/contracts";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateMetronomeContract,
  mockCreateMetronomeCustomer,
  mockFindMetronomeCustomerByAlias,
  mockGetMetronomeContractById,
  mockGetMetronomeCustomerStripeCustomerId,
  mockHasContractSeatSubscription,
  mockGetStripeCustomer,
  mockGetStripeSubscription,
  mockHasMauSubscriptionInContract,
  mockListMetronomeContracts,
  mockPrices,
  mockScheduleMetronomeContractEnd,
  mockSyncMauCount,
  mockSyncSeatCount,
  mockRemapMembershipSeatTypesForContract,
  mockBuildSeatDataByUserId,
} = vi.hoisted(() => {
  const mockPrices = { retrieve: vi.fn() };

  return {
    mockCreateMetronomeContract: vi.fn(),
    mockCreateMetronomeCustomer: vi.fn(),
    mockFindMetronomeCustomerByAlias: vi.fn(),
    mockGetMetronomeContractById: vi.fn(),
    mockGetMetronomeCustomerStripeCustomerId: vi.fn(),
    mockHasContractSeatSubscription: vi.fn(),
    mockGetStripeCustomer: vi.fn(),
    mockGetStripeSubscription: vi.fn(),
    mockHasMauSubscriptionInContract: vi.fn(),
    mockListMetronomeContracts: vi.fn(),
    mockPrices,
    mockScheduleMetronomeContractEnd: vi.fn(),
    mockSyncMauCount: vi.fn(),
    mockSyncSeatCount: vi.fn(),
    mockRemapMembershipSeatTypesForContract: vi.fn(),
    mockBuildSeatDataByUserId: vi.fn(),
  };
});

vi.mock("@app/lib/metronome/client", () => ({
  ceilToHourISO: (date: Date) => date.toISOString(),
  floorToHourISO: (date: Date) => date.toISOString(),
  createMetronomeContract: mockCreateMetronomeContract,
  createMetronomeCustomer: mockCreateMetronomeCustomer,
  epochSecondsToFloorHourISO: vi.fn(),
  findMetronomeCustomerByAlias: mockFindMetronomeCustomerByAlias,
  getMetronomeClient: vi.fn(),
  getMetronomeContractById: mockGetMetronomeContractById,
  getMetronomeCustomerStripeCustomerId:
    mockGetMetronomeCustomerStripeCustomerId,
  listMetronomeContracts: mockListMetronomeContracts,
  scheduleMetronomeContractEnd: mockScheduleMetronomeContractEnd,
}));

vi.mock("@app/lib/metronome/seats", () => ({
  hasContractSeatSubscription: mockHasContractSeatSubscription,
  syncSeatCount: mockSyncSeatCount,
  remapMembershipSeatTypesForContract: mockRemapMembershipSeatTypesForContract,
  buildSeatDataByUserId: mockBuildSeatDataByUserId,
}));

vi.mock("@app/lib/api/metronome/credit_state_dispatcher", () => ({
  syncPoolCreditStateFromBalance: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/lib/resources/workspace_resource", () => ({
  WorkspaceResource: {
    fetchById: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@app/lib/plans/stripe", () => ({
  getStripeClient: () => ({ prices: mockPrices }),
  getStripeCustomer: mockGetStripeCustomer,
  getStripeSubscription: mockGetStripeSubscription,
}));

vi.mock("@app/lib/metronome/constants", () => ({
  CURRENCY_TO_CREDIT_TYPE_ID: {
    usd: "usd-credit-type",
    eur: "eur-credit-type",
  },
}));

const WORKSPACE = {
  id: 42,
  sId: "w_123",
  name: "Workspace",
} as LightWorkspaceType;

const CONTRACT = {
  id: "m-contract",
  subscriptions: [],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(START_DATE));

  mockPrices.retrieve.mockReset();

  mockFindMetronomeCustomerByAlias.mockReset();
  mockFindMetronomeCustomerByAlias.mockResolvedValue(new Ok("m-customer"));

  mockCreateMetronomeCustomer.mockReset();
  mockCreateMetronomeCustomer.mockResolvedValue(
    new Ok({ metronomeCustomerId: "m-customer" })
  );

  mockCreateMetronomeContract.mockReset();
  mockCreateMetronomeContract.mockResolvedValue(
    new Ok({ contractId: "m-contract" })
  );

  mockScheduleMetronomeContractEnd.mockReset();
  mockScheduleMetronomeContractEnd.mockResolvedValue(new Ok(undefined));

  mockListMetronomeContracts.mockReset();
  mockListMetronomeContracts.mockResolvedValue(new Ok([]));

  mockGetMetronomeContractById.mockReset();
  mockGetMetronomeContractById.mockResolvedValue(new Ok(CONTRACT));

  mockHasContractSeatSubscription.mockReset();
  mockHasContractSeatSubscription.mockResolvedValue(true);

  mockHasMauSubscriptionInContract.mockReset();
  mockHasMauSubscriptionInContract.mockReturnValue(true);

  mockSyncSeatCount.mockReset();
  mockSyncSeatCount.mockResolvedValue(new Ok(undefined));

  mockSyncMauCount.mockReset();
  mockSyncMauCount.mockResolvedValue(new Ok(undefined));

  mockRemapMembershipSeatTypesForContract.mockReset();
  mockRemapMembershipSeatTypesForContract.mockResolvedValue(new Ok(undefined));

  mockBuildSeatDataByUserId.mockReset();
  mockBuildSeatDataByUserId.mockResolvedValue(new Ok(new Map()));
});

const START_DATE = "2026-04-01T00:00:00.000Z";

describe("provisionMetronomeContract", () => {
  it("syncs seats when provisioning a contract", async () => {
    const result = await provisionMetronomeContract({
      metronomeCustomerId: "m-customer",
      workspace: WORKSPACE,
      packageAlias: "legacy-pro-monthly",
      uniquenessKey: "uniq_123",
      startingAt: new Date(START_DATE),
      planCode: "PRO_PLAN_SEAT_29",
    });

    expect(result.isOk()).toBe(true);
    expect(mockSyncSeatCount).toHaveBeenCalledTimes(1);
    expect(mockSyncSeatCount).toHaveBeenCalledWith({
      metronomeCustomerId: "m-customer",
      contractId: "m-contract",
      workspace: WORKSPACE,
      planCode: "PRO_PLAN_SEAT_29",
      startingAt: START_DATE,
    });
  });
});

describe("provisionMetronomeContract — overlap sunset", () => {
  it("ends non-archived contracts that overlap with the new start", async () => {
    mockListMetronomeContracts.mockResolvedValue(
      new Ok([
        // overlaps — starts before, no end
        {
          id: "overlap-1",
          starting_at: "2026-03-01T00:00:00.000Z",
          ending_before: null,
          archived_at: null,
        },
        // starts AFTER the new start — skipped
        {
          id: "future",
          starting_at: "2026-05-01T00:00:00.000Z",
          ending_before: null,
          archived_at: null,
        },
        // ended BEFORE the new start — skipped
        {
          id: "ended",
          starting_at: "2026-03-01T00:00:00.000Z",
          ending_before: "2026-03-15T00:00:00.000Z",
          archived_at: null,
        },
        // archived — skipped
        {
          id: "archived",
          starting_at: "2026-03-01T00:00:00.000Z",
          ending_before: null,
          archived_at: "2026-03-10T00:00:00.000Z",
        },
        // the newly-created contract — skipped by id
        {
          id: "m-contract",
          starting_at: START_DATE,
          ending_before: null,
          archived_at: null,
        },
      ])
    );

    const result = await provisionMetronomeContract({
      metronomeCustomerId: "m-customer",
      workspace: WORKSPACE,
      packageAlias: "legacy-pro-monthly",
      uniquenessKey: "uniq_123",
      startingAt: new Date(START_DATE),
      planCode: "PRO_PLAN_SEAT_29",
    });

    expect(result.isOk()).toBe(true);
    expect(mockScheduleMetronomeContractEnd).toHaveBeenCalledTimes(1);
    expect(mockScheduleMetronomeContractEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        metronomeCustomerId: "m-customer",
        contractId: "overlap-1",
      })
    );
  });

  it("forwards fromContractId and skips it in the sunset pass", async () => {
    mockListMetronomeContracts.mockResolvedValue(
      new Ok([
        // the prior contract the transition renews from — ended by Metronome,
        // so it must NOT be sunset again here.
        {
          id: "prior-contract",
          starting_at: "2026-03-01T00:00:00.000Z",
          ending_before: null,
          archived_at: null,
        },
        // an unrelated stray overlap — still sunset.
        {
          id: "overlap-1",
          starting_at: "2026-03-01T00:00:00.000Z",
          ending_before: null,
          archived_at: null,
        },
      ])
    );

    const result = await provisionMetronomeContract({
      metronomeCustomerId: "m-customer",
      workspace: WORKSPACE,
      packageAlias: "legacy-pro-monthly",
      uniquenessKey: "uniq_123",
      startingAt: new Date(START_DATE),
      planCode: "PRO_PLAN_SEAT_29",
      fromContractId: "prior-contract",
    });

    expect(result.isOk()).toBe(true);
    expect(mockCreateMetronomeContract).toHaveBeenCalledWith(
      expect.objectContaining({ fromContractId: "prior-contract" })
    );
    expect(mockScheduleMetronomeContractEnd).toHaveBeenCalledTimes(1);
    expect(mockScheduleMetronomeContractEnd).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: "overlap-1" })
    );
  });

  it("returns an error when listing contracts fails", async () => {
    mockListMetronomeContracts.mockResolvedValue(
      new Err(new Error("list failed"))
    );

    const result = await provisionMetronomeContract({
      metronomeCustomerId: "m-customer",
      workspace: WORKSPACE,
      packageAlias: "legacy-pro-monthly",
      uniquenessKey: "uniq_123",
      startingAt: new Date(START_DATE),
      planCode: "PRO_PLAN_SEAT_29",
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("expected error");
    }
    expect(result.error.message).toContain("failed to list");
  });
});

describe("provisionPaymentGatedActivationContract", () => {
  it("creates a contract with the expected custom fields", async () => {
    const result = await provisionPaymentGatedActivationContract({
      metronomeCustomerId: "m-customer",
      workspace: WORKSPACE,
      packageAlias: "business-usd",
      uniquenessKey: "activation-w_123-setup_xyz",
      startingAt: new Date(START_DATE),
      planCode: "CP_BUSINESS_PLAN",
      additionalCustomFields: {
        DUST_PAYMENT_GATE_TYPE: "subscription_activation",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(mockCreateMetronomeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        metronomeCustomerId: "m-customer",
        packageAlias: "business-usd",
        planCode: "CP_BUSINESS_PLAN",
        additionalCustomFields: {
          DUST_PAYMENT_GATE_TYPE: "subscription_activation",
        },
        enableStripeBilling: true,
      })
    );
  });

  it("does not sunset any overlapping existing contracts", async () => {
    mockListMetronomeContracts.mockResolvedValue(
      new Ok([
        {
          id: "existing-free-contract",
          starting_at: "2026-03-01T00:00:00.000Z",
          ending_before: null,
          archived_at: null,
        },
      ])
    );

    const result = await provisionPaymentGatedActivationContract({
      metronomeCustomerId: "m-customer",
      workspace: WORKSPACE,
      packageAlias: "business-usd",
      startingAt: new Date(START_DATE),
      planCode: "CP_BUSINESS_PLAN",
    });

    expect(result.isOk()).toBe(true);
    expect(mockScheduleMetronomeContractEnd).not.toHaveBeenCalled();
  });

  it("returns an error when contract creation fails", async () => {
    mockCreateMetronomeContract.mockResolvedValue(
      new Err(new Error("Metronome API error"))
    );

    const result = await provisionPaymentGatedActivationContract({
      metronomeCustomerId: "m-customer",
      workspace: WORKSPACE,
      packageAlias: "business-usd",
      startingAt: new Date(START_DATE),
      planCode: "CP_BUSINESS_PLAN",
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("expected error");
    }
    expect(result.error.message).toBe("Metronome API error");
  });

  it("does not run seat sync", async () => {
    await provisionPaymentGatedActivationContract({
      metronomeCustomerId: "m-customer",
      workspace: WORKSPACE,
      packageAlias: "business-usd",
      startingAt: new Date(START_DATE),
      planCode: "CP_BUSINESS_PLAN",
    });

    expect(mockSyncSeatCount).not.toHaveBeenCalled();
    expect(mockSyncMauCount).not.toHaveBeenCalled();
    expect(mockRemapMembershipSeatTypesForContract).not.toHaveBeenCalled();
  });
});

describe("resolveCurrencyForExistingMetronomeCustomer", () => {
  beforeEach(() => {
    mockGetStripeSubscription.mockReset();
    mockGetStripeCustomer.mockReset();
    mockGetMetronomeCustomerStripeCustomerId.mockReset();
  });

  it("uses the Stripe subscription currency on the Stripe-billed path", async () => {
    mockGetStripeSubscription.mockResolvedValue({ currency: "eur" });

    const result = await resolveCurrencyForExistingMetronomeCustomer({
      metronomeCustomerId: "cust_1",
      stripeSubscriptionId: "sub_1",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toBe("eur");
    expect(mockGetMetronomeCustomerStripeCustomerId).not.toHaveBeenCalled();
  });

  it("falls back to the Metronome-linked Stripe customer when no sub", async () => {
    mockGetMetronomeCustomerStripeCustomerId.mockResolvedValue(
      new Ok("cus_eu")
    );
    mockGetStripeCustomer.mockResolvedValue({
      currency: "eur",
      address: null,
    });

    const result = await resolveCurrencyForExistingMetronomeCustomer({
      metronomeCustomerId: "cust_1",
      stripeSubscriptionId: null,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toBe("eur");
    expect(mockGetStripeSubscription).not.toHaveBeenCalled();
  });

  it("falls back to the customer's address country when currency is unset", async () => {
    mockGetMetronomeCustomerStripeCustomerId.mockResolvedValue(
      new Ok("cus_fr")
    );
    mockGetStripeCustomer.mockResolvedValue({
      currency: null,
      address: { country: "FR" },
    });

    const result = await resolveCurrencyForExistingMetronomeCustomer({
      metronomeCustomerId: "cust_1",
      stripeSubscriptionId: null,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toBe("eur");
  });

  it("returns an error when no Stripe sub and Metronome has no Stripe billing config", async () => {
    mockGetMetronomeCustomerStripeCustomerId.mockResolvedValue(new Ok(null));

    const result = await resolveCurrencyForExistingMetronomeCustomer({
      metronomeCustomerId: "cust_1",
      stripeSubscriptionId: null,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("no Stripe billing config found");
    }
    expect(mockGetStripeCustomer).not.toHaveBeenCalled();
  });

  it("falls back to the Metronome customer when getStripeSubscription returns null", async () => {
    mockGetStripeSubscription.mockResolvedValue(null);
    mockGetMetronomeCustomerStripeCustomerId.mockResolvedValue(
      new Ok("cus_fr")
    );
    mockGetStripeCustomer.mockResolvedValue({
      currency: null,
      address: { country: "FR" },
    });

    const result = await resolveCurrencyForExistingMetronomeCustomer({
      metronomeCustomerId: "cust_1",
      stripeSubscriptionId: "sub_dead",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toBe("eur");
    expect(mockGetMetronomeCustomerStripeCustomerId).toHaveBeenCalledTimes(1);
  });

  it("returns an error when getMetronomeCustomerStripeCustomerId errs", async () => {
    mockGetMetronomeCustomerStripeCustomerId.mockResolvedValue(
      new Err(new Error("boom"))
    );

    const result = await resolveCurrencyForExistingMetronomeCustomer({
      metronomeCustomerId: "cust_1",
      stripeSubscriptionId: null,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "could not read Stripe billing config: boom"
      );
    }
    expect(mockGetStripeCustomer).not.toHaveBeenCalled();
  });

  it("returns an error when the linked Stripe customer cannot be retrieved", async () => {
    mockGetMetronomeCustomerStripeCustomerId.mockResolvedValue(
      new Ok("cus_missing")
    );
    mockGetStripeCustomer.mockResolvedValue(null);

    const result = await resolveCurrencyForExistingMetronomeCustomer({
      metronomeCustomerId: "cust_1",
      stripeSubscriptionId: null,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "Stripe customer cus_missing could not be retrieved"
      );
    }
  });
});
