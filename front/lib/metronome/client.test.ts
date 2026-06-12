import {
  addPaymentGatedCommitToContract,
  addPrepaidCommitToContract,
  createMetronomeContract,
  createMetronomeCredit,
} from "@app/lib/metronome/client";
import type { Result } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

function unwrapOk<T>(result: Result<T, Error>): T {
  expect(result.isOk()).toBe(true);
  if (!result.isOk()) {
    throw new Error("Expected Ok");
  }
  return result.value;
}

function unwrapErr<T>(result: Result<T, Error>): Error {
  expect(result.isErr()).toBe(true);
  if (!result.isErr()) {
    throw new Error("Expected Err");
  }
  return result.error;
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockCreate,
  mockList,
  mockContractsCreate,
  mockContractsEdit,
  mockSetCustomFieldValues,
  MockConflictError,
} = vi.hoisted(() => {
  class MockConflictError extends Error {
    status = 409;
  }
  return {
    mockCreate: vi.fn(),
    mockList: vi.fn(),
    mockContractsCreate: vi.fn(),
    mockContractsEdit: vi.fn(),
    mockSetCustomFieldValues: vi.fn(),
    MockConflictError,
  };
});

vi.mock("@metronome/sdk", () => {
  // Must use a regular function (not an arrow) so it can be called with `new`.
  function MockMetronome() {
    return {
      v1: {
        customers: {
          credits: { create: mockCreate, list: mockList },
        },
        contracts: { create: mockContractsCreate },
        customFields: { setValues: mockSetCustomFieldValues },
      },
      v2: {
        contracts: { edit: mockContractsEdit },
      },
    };
  }
  return { default: MockMetronome, ConflictError: MockConflictError };
});

vi.mock("@app/lib/api/config", () => ({
  default: { getMetronomeApiKey: () => "test-api-key" },
}));

vi.mock("@app/logger/logger", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_PARAMS = {
  metronomeCustomerId: "cust-1",
  productId: "prod-1",
  creditTypeId: "credit-type-usd",
  amount: 10_000,
  startingAt: "2026-04-01T00:00:00.000Z",
  endingBefore: "2027-04-01T00:00:00.000Z",
  name: "Test credit",
  idempotencyKey: "key-1",
  priority: 1,
};

beforeEach(() => {
  mockCreate.mockReset();
  mockList.mockReset();
  mockCreate.mockResolvedValue({ data: { id: "credit-id-1" } });

  mockContractsCreate.mockReset();
  mockContractsCreate.mockResolvedValue({ data: { id: "contract-id-1" } });
  mockContractsEdit.mockReset();
  mockContractsEdit.mockResolvedValue({ data: { id: "edit-id-1" } });
  mockSetCustomFieldValues.mockReset();
  mockSetCustomFieldValues.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// createMetronomeCredit
// ---------------------------------------------------------------------------

describe("createMetronomeCredit", () => {
  it("forwards priority to the API call", async () => {
    await createMetronomeCredit({ ...BASE_PARAMS, priority: 0 });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 0 })
    );
  });

  it("spreads applicableProductTags when provided", async () => {
    await createMetronomeCredit({
      ...BASE_PARAMS,
      applicableProductTags: ["usage"],
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ applicable_product_tags: ["usage"] })
    );
  });

  it("returns Ok with the credit id on success", async () => {
    const result = await createMetronomeCredit(BASE_PARAMS);

    expect(unwrapOk(result)).toEqual({ id: "credit-id-1" });
  });

  it("on ConflictError, looks up the existing credit and returns its id", async () => {
    mockCreate.mockRejectedValueOnce(new MockConflictError("conflict"));
    mockList.mockResolvedValue({
      data: [{ id: "existing-id", uniqueness_key: BASE_PARAMS.idempotencyKey }],
    });

    const result = await createMetronomeCredit(BASE_PARAMS);

    expect(unwrapOk(result)).toEqual({ id: "existing-id" });
  });

  it("on ConflictError with no matching credit in list, returns Ok(null)", async () => {
    mockCreate.mockRejectedValueOnce(new MockConflictError("conflict"));
    mockList.mockResolvedValue({ data: [] });

    const result = await createMetronomeCredit(BASE_PARAMS);

    expect(unwrapOk(result)).toBeNull();
  });

  it("returns Err on non-conflict API failure", async () => {
    mockCreate.mockRejectedValueOnce(new Error("network error"));

    const result = await createMetronomeCredit(BASE_PARAMS);

    expect(unwrapErr(result).message).toMatch(/network error/);
  });
});

// ---------------------------------------------------------------------------
// createMetronomeContract — transition payload
// ---------------------------------------------------------------------------

describe("createMetronomeContract", () => {
  const BASE_CONTRACT_PARAMS = {
    metronomeCustomerId: "cust-1",
    packageAlias: "legacy-pro-monthly",
    startingAt: new Date("2026-04-01T00:00:00.000Z"),
    enableStripeBilling: false,
    planCode: "PRO_PLAN_SEAT_29",
  };

  it("omits the transition when no fromContractId is given", async () => {
    const result = await createMetronomeContract(BASE_CONTRACT_PARAMS);

    expect(result.isOk()).toBe(true);
    expect(mockContractsCreate).toHaveBeenCalledTimes(1);
    expect(mockContractsCreate.mock.calls[0][0]).not.toHaveProperty(
      "transition"
    );
  });

  it("sends a RENEWAL transition when fromContractId is given", async () => {
    const result = await createMetronomeContract({
      ...BASE_CONTRACT_PARAMS,
      fromContractId: "prior-contract",
    });

    expect(result.isOk()).toBe(true);
    expect(mockContractsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        transition: { type: "RENEWAL", from_contract_id: "prior-contract" },
      })
    );
  });
});

// ---------------------------------------------------------------------------
// add*CommitToContract — rollover_fraction
// ---------------------------------------------------------------------------

const BASE_PREPAID_COMMIT_PARAMS = {
  metronomeCustomerId: "cust-1",
  metronomeContractId: "contract-1",
  productId: "prod-1",
  accessAmount: 10_000,
  accessCreditTypeId: "credit-type-awu",
  accessStartingAt: new Date("2026-04-01T00:00:00.000Z"),
  accessEndingBefore: new Date("2027-04-01T00:00:00.000Z"),
  invoiceUnitPrice: 5_000,
  invoiceQuantity: 1,
  invoiceCreditTypeId: "credit-type-usd",
  invoiceTimestamp: new Date("2026-04-01T00:00:00.000Z"),
  priority: 2,
  name: "Test commit",
  uniquenessKey: "commit-key-1",
};

function firstAddedCommit() {
  return mockContractsEdit.mock.calls[0][0].add_commits[0];
}

describe("addPrepaidCommitToContract", () => {
  it("forwards rollover_fraction when provided", async () => {
    await addPrepaidCommitToContract({
      ...BASE_PREPAID_COMMIT_PARAMS,
      rolloverFraction: 1,
    });

    expect(firstAddedCommit()).toMatchObject({ rollover_fraction: 1 });
  });

  it("omits rollover_fraction when not provided", async () => {
    await addPrepaidCommitToContract(BASE_PREPAID_COMMIT_PARAMS);

    expect(firstAddedCommit()).not.toHaveProperty("rollover_fraction");
  });
});

describe("addPaymentGatedCommitToContract", () => {
  const BASE_PAYMENT_GATED_PARAMS = {
    ...BASE_PREPAID_COMMIT_PARAMS,
    applicableProducTags: ["usage"],
    stripeInvoiceMetadata: { workspace_id: "ws-1" },
  };

  it("forwards rollover_fraction when provided", async () => {
    await addPaymentGatedCommitToContract({
      ...BASE_PAYMENT_GATED_PARAMS,
      rolloverFraction: 1,
    });

    expect(firstAddedCommit()).toMatchObject({ rollover_fraction: 1 });
  });

  it("omits rollover_fraction when not provided", async () => {
    await addPaymentGatedCommitToContract(BASE_PAYMENT_GATED_PARAMS);

    expect(firstAddedCommit()).not.toHaveProperty("rollover_fraction");
  });
});
