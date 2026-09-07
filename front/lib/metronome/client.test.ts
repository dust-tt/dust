import {
  addComplimentaryCommitToContract,
  addPaymentGatedCommitToContract,
  addPrepaidCommitToContract,
  adjustSeatCreditBalances,
  createMetronomeContract,
  createMetronomeCredit,
  findSeatCreditSegmentForPeriod,
  updateSubscriptionSeats,
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
  mockAddManualBalanceEntry,
  mockContractsCreate,
  mockContractsEdit,
  mockSetCustomFieldValues,
  MockConflictError,
  MockUnprocessableEntityError,
} = vi.hoisted(() => {
  class MockConflictError extends Error {
    status = 409;
  }
  class MockUnprocessableEntityError extends Error {
    status = 422;
  }
  return {
    mockCreate: vi.fn(),
    mockList: vi.fn(),
    mockAddManualBalanceEntry: vi.fn(),
    mockContractsCreate: vi.fn(),
    mockContractsEdit: vi.fn(),
    mockSetCustomFieldValues: vi.fn(),
    MockConflictError,
    MockUnprocessableEntityError,
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
        contracts: {
          addManualBalanceEntry: mockAddManualBalanceEntry,
          create: mockContractsCreate,
        },
        customFields: { setValues: mockSetCustomFieldValues },
      },
      v2: {
        contracts: { edit: mockContractsEdit },
      },
    };
  }
  return {
    default: MockMetronome,
    ConflictError: MockConflictError,
    UnprocessableEntityError: MockUnprocessableEntityError,
  };
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
  mockAddManualBalanceEntry.mockReset();
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
    mockList.mockReturnValue([
      { id: "existing-id", uniqueness_key: BASE_PARAMS.idempotencyKey },
    ]);

    const result = await createMetronomeCredit(BASE_PARAMS);

    expect(unwrapOk(result)).toEqual({ id: "existing-id" });
  });

  it("on ConflictError with no matching credit in list, returns Ok(null)", async () => {
    mockCreate.mockRejectedValueOnce(new MockConflictError("conflict"));
    mockList.mockReturnValue([]);

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
// findSeatCreditSegmentForPeriod
// ---------------------------------------------------------------------------

const SEAT_CREDIT_PARAMS = {
  metronomeCustomerId: "cust-1",
  metronomeContractId: "contract-1",
  recurringCreditId: "recurring-1",
  coveringDate: new Date("2026-06-15T12:00:00.000Z"),
};

function makeSeatCredit(
  opts: {
    id?: string;
    contractId?: string;
    name?: string;
    recurringCreditId?: string | undefined;
    scheduleItems?: Array<{
      id: string;
      amount: number;
      starting_at: string;
      ending_before: string;
    }>;
  } = {}
) {
  const {
    id = "credit-1",
    contractId = "contract-1",
    name = "Max Seat Credits",
    scheduleItems = [
      {
        id: "segment-1",
        amount: 80_000,
        starting_at: "2026-06-10T00:00:00.000Z",
        ending_before: "2026-07-10T00:00:00.000Z",
      },
    ],
  } = opts;
  // Use `in` so an explicit `recurringCreditId: undefined` is honored (a
  // destructuring default would replace it with the fallback).
  const recurringCreditId =
    "recurringCreditId" in opts ? opts.recurringCreditId : "recurring-1";
  return {
    id,
    name,
    recurring_credit_id: recurringCreditId,
    contract: { id: contractId },
    access_schedule: { schedule_items: scheduleItems },
  };
}

describe("findSeatCreditSegmentForPeriod", () => {
  it("returns the credit and segment covering the date", async () => {
    mockList.mockReturnValue([makeSeatCredit()]);

    const result = await findSeatCreditSegmentForPeriod(SEAT_CREDIT_PARAMS);

    expect(unwrapOk(result)).toEqual({
      creditId: "credit-1",
      segmentId: "segment-1",
      segmentStartingAt: "2026-06-10T00:00:00.000Z",
    });
  });

  it("matches by recurring credit id, skipping a same-named credit with a different id", async () => {
    mockList.mockReturnValue([
      // Same name ("Max Seat Credits") but a different recurring credit (e.g.
      // the yearly product's pool) — must NOT be picked.
      makeSeatCredit({
        id: "other-recurring",
        recurringCreditId: "recurring-2",
      }),
      makeSeatCredit({ id: "no-recurring", recurringCreditId: undefined }),
      makeSeatCredit({ id: "credit-match", recurringCreditId: "recurring-1" }),
    ]);

    const result = await findSeatCreditSegmentForPeriod(SEAT_CREDIT_PARAMS);

    expect(unwrapOk(result)).toEqual({
      creditId: "credit-match",
      segmentId: "segment-1",
      segmentStartingAt: "2026-06-10T00:00:00.000Z",
    });
  });

  it("returns null when no segment covers the date", async () => {
    mockList.mockReturnValue([
      makeSeatCredit({
        scheduleItems: [
          {
            id: "stale-segment",
            amount: 80_000,
            starting_at: "2026-05-10T00:00:00.000Z",
            ending_before: "2026-06-10T00:00:00.000Z",
          },
        ],
      }),
    ]);

    const result = await findSeatCreditSegmentForPeriod(SEAT_CREDIT_PARAMS);

    expect(unwrapOk(result)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// adjustSeatCreditBalances
// ---------------------------------------------------------------------------

const ADJUST_PARAMS = {
  metronomeCustomerId: "cust-1",
  metronomeContractId: "contract-1",
  creditId: "credit-1",
  segmentId: "segment-1",
  reason: "test adjustment",
};

describe("adjustSeatCreditBalances", () => {
  it("sums per-seat amounts into the total and floors the timestamp to the hour", async () => {
    mockAddManualBalanceEntry.mockResolvedValue(undefined);

    const result = await adjustSeatCreditBalances({
      ...ADJUST_PARAMS,
      perSeatAmounts: { seatA: -1000, seatB: -500 },
      timestamp: new Date("2026-06-11T15:30:45.000Z"),
    });

    expect(result.isOk()).toBe(true);
    expect(mockAddManualBalanceEntry).toHaveBeenCalledWith(
      {
        id: "credit-1",
        customer_id: "cust-1",
        contract_id: "contract-1",
        segment_id: "segment-1",
        amount: -1500,
        per_group_amounts: { seatA: -1000, seatB: -500 },
        reason: "test adjustment",
        timestamp: "2026-06-11T15:00:00.000Z",
      },
      // Manual ledger entries can't be deduped (no uniqueness_key), so we
      // disable the SDK retry to avoid stacking the delta on a 504.
      { maxRetries: 0 }
    );
  });

  it("is a no-op when no per-seat amounts are provided", async () => {
    const result = await adjustSeatCreditBalances({
      ...ADJUST_PARAMS,
      perSeatAmounts: {},
    });

    expect(result.isOk()).toBe(true);
    expect(mockAddManualBalanceEntry).not.toHaveBeenCalled();
  });

  it("returns Err when the API call fails", async () => {
    mockAddManualBalanceEntry.mockRejectedValueOnce(new Error("api boom"));

    const result = await adjustSeatCreditBalances({
      ...ADJUST_PARAMS,
      perSeatAmounts: { seatA: -1000 },
    });

    expect(unwrapErr(result).message).toMatch(/api boom/);
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
// add*CommitToContract — custom_fields (carry-on-renewal flag)
// ---------------------------------------------------------------------------

const BASE_PREPAID_COMMIT_PARAMS = {
  metronomeCustomerId: "cust-1",
  metronomeContractId: "contract-1",
  productId: "prod-1",
  accessAmount: 10_000,
  accessCreditTypeId: "credit-type-awu",
  accessStartingAt: new Date("2026-04-01T00:00:00.000Z"),
  accessEndingBefore: new Date("2027-04-01T00:00:00.000Z"),
  invoiceScheduleItems: [
    {
      unitPrice: 5_000,
      quantity: 1,
      timestamp: new Date("2026-04-01T00:00:00.000Z"),
    },
  ],
  invoiceCreditTypeId: "credit-type-usd",
  priority: 2,
  name: "Test commit",
  uniquenessKey: "commit-key-1",
};

function firstAddedCommit() {
  return mockContractsEdit.mock.calls[0][0].add_commits[0];
}

describe("addPrepaidCommitToContract", () => {
  it("forwards custom_fields when provided", async () => {
    await addPrepaidCommitToContract({
      ...BASE_PREPAID_COMMIT_PARAMS,
      customFields: { DUST_CARRY_ON_RENEWAL: "true" },
    });

    expect(firstAddedCommit()).toMatchObject({
      custom_fields: { DUST_CARRY_ON_RENEWAL: "true" },
    });
  });

  it("omits custom_fields when not provided", async () => {
    await addPrepaidCommitToContract(BASE_PREPAID_COMMIT_PARAMS);

    expect(firstAddedCommit()).not.toHaveProperty("custom_fields");
  });
});

describe("addPaymentGatedCommitToContract", () => {
  const BASE_PAYMENT_GATED_PARAMS = {
    ...BASE_PREPAID_COMMIT_PARAMS,
    invoiceUnitPrice: 5_000,
    invoiceQuantity: 1,
    invoiceTimestamp: new Date("2026-04-01T00:00:00.000Z"),
    applicableProducTags: ["usage"],
    stripeInvoiceMetadata: { workspace_id: "ws-1" },
  };

  it("forwards custom_fields when provided", async () => {
    await addPaymentGatedCommitToContract({
      ...BASE_PAYMENT_GATED_PARAMS,
      customFields: { DUST_CARRY_ON_RENEWAL: "true" },
    });

    expect(firstAddedCommit()).toMatchObject({
      custom_fields: { DUST_CARRY_ON_RENEWAL: "true" },
    });
  });

  it("omits custom_fields when not provided", async () => {
    await addPaymentGatedCommitToContract(BASE_PAYMENT_GATED_PARAMS);

    expect(firstAddedCommit()).not.toHaveProperty("custom_fields");
  });
});

describe("addComplimentaryCommitToContract", () => {
  const BASE_COMPLIMENTARY_PARAMS = {
    metronomeCustomerId: "cust-1",
    metronomeContractId: "contract-2",
    productId: "prod-1",
    accessAmount: 4_200,
    accessCreditTypeId: "credit-type-awu",
    accessStartingAt: new Date("2026-04-01T00:00:00.000Z"),
    accessEndingBefore: new Date("2027-04-01T00:00:00.000Z"),
    priority: 300,
    name: "Carried-over balance",
    uniquenessKey: "carry:contract-2:commit-1",
  };

  it("adds a PREPAID commit with no invoice schedule", async () => {
    await addComplimentaryCommitToContract({
      ...BASE_COMPLIMENTARY_PARAMS,
      customFields: { DUST_CARRY_ON_RENEWAL: "true" },
    });

    const commit = firstAddedCommit();
    expect(commit).toMatchObject({
      type: "PREPAID",
      custom_fields: { DUST_CARRY_ON_RENEWAL: "true" },
    });
    expect(commit.access_schedule.schedule_items[0].amount).toBe(4_200);
    expect(commit).not.toHaveProperty("invoice_schedule");
  });
});

// ---------------------------------------------------------------------------
// updateSubscriptionSeats
// ---------------------------------------------------------------------------

describe("updateSubscriptionSeats", () => {
  const seatIds = (n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

  it("sends a single edit when at or below the 1000-seat cap", async () => {
    const result = await updateSubscriptionSeats({
      metronomeCustomerId: "cust-1",
      contractId: "contract-1",
      fromSubscriptionId: "sub-1",
      addSeatIds: seatIds(1000, "add"),
      startingAt: "2026-04-01T00:00:00.000Z",
    });

    unwrapOk(result);
    expect(mockContractsEdit).toHaveBeenCalledTimes(1);
    const call = mockContractsEdit.mock.calls[0][0];
    expect(
      call.update_subscriptions[0].seat_updates.add_seat_ids[0].seat_ids
    ).toHaveLength(1000);
    // Each edit carries a uniqueness_key so an SDK retry can't stack the delta.
    expect(typeof call.uniqueness_key).toBe("string");
  });

  it("treats a duplicate uniqueness_key 422 as success (edit already applied on a 504 retry)", async () => {
    // Metronome surfaces a reused uniqueness_key as a 422, not the 409 the docs
    // imply. The message guard is what tells it apart from a real 422.
    mockContractsEdit.mockRejectedValueOnce(
      new MockUnprocessableEntityError(
        "422 Uniqueness key already exists: c3b61abb-e577-46f9-aaa5-0c488769db8c"
      )
    );

    const result = await updateSubscriptionSeats({
      metronomeCustomerId: "cust-1",
      contractId: "contract-1",
      fromSubscriptionId: "sub-1",
      addUnassignedSeats: 137,
      startingAt: "2026-04-01T00:00:00.000Z",
    });

    unwrapOk(result);
  });

  it("also treats a duplicate uniqueness_key 409 as success (defensive)", async () => {
    mockContractsEdit.mockRejectedValueOnce(
      new MockConflictError("Uniqueness key already exists: some-key")
    );

    const result = await updateSubscriptionSeats({
      metronomeCustomerId: "cust-1",
      contractId: "contract-1",
      fromSubscriptionId: "sub-1",
      addUnassignedSeats: 137,
      startingAt: "2026-04-01T00:00:00.000Z",
    });

    unwrapOk(result);
  });

  it("surfaces a non-duplicate 422 as an error (does not swallow real validation failures)", async () => {
    mockContractsEdit.mockRejectedValueOnce(
      new MockUnprocessableEntityError("422 Invalid seat_updates payload")
    );

    const result = await updateSubscriptionSeats({
      metronomeCustomerId: "cust-1",
      contractId: "contract-1",
      fromSubscriptionId: "sub-1",
      addUnassignedSeats: 137,
      startingAt: "2026-04-01T00:00:00.000Z",
    });

    expect(result.isErr()).toBe(true);
  });

  it("chunks adds and removes into separate edits above the cap", async () => {
    const result = await updateSubscriptionSeats({
      metronomeCustomerId: "cust-1",
      contractId: "contract-1",
      fromSubscriptionId: "sub-1",
      addSeatIds: seatIds(2500, "add"),
      removeSeatIds: seatIds(1200, "rm"),
      addUnassignedSeats: 5,
      startingAt: "2026-04-01T00:00:00.000Z",
    });

    unwrapOk(result);
    // 2500 adds → 3 chunks; 1200 removes → 2 chunks; editCount = max = 3.
    expect(mockContractsEdit).toHaveBeenCalledTimes(3);

    // No single edit exceeds the cap.
    for (const [{ update_subscriptions }] of mockContractsEdit.mock.calls) {
      for (const { seat_updates } of update_subscriptions) {
        for (const entry of seat_updates.add_seat_ids ?? []) {
          expect(entry.seat_ids.length).toBeLessThanOrEqual(1000);
        }
        for (const entry of seat_updates.remove_seat_ids ?? []) {
          expect(entry.seat_ids.length).toBeLessThanOrEqual(1000);
        }
      }
    }

    // Every add/remove is sent exactly once across all edits.
    const allAdds = mockContractsEdit.mock.calls.flatMap(
      ([{ update_subscriptions }]) =>
        update_subscriptions.flatMap(
          ({
            seat_updates,
          }: {
            seat_updates: { add_seat_ids?: { seat_ids: string[] }[] };
          }) => (seat_updates.add_seat_ids ?? []).flatMap((e) => e.seat_ids)
        )
    );
    expect(new Set(allAdds).size).toBe(2500);

    // Unassigned delta is applied on the final edit only.
    const lastCall = mockContractsEdit.mock.calls[2][0];
    expect(
      lastCall.update_subscriptions[0].seat_updates.add_unassigned_seats[0]
        .quantity
    ).toBe(5);
  });

  it("does not call edit when there is nothing to change", async () => {
    const result = await updateSubscriptionSeats({
      metronomeCustomerId: "cust-1",
      contractId: "contract-1",
      fromSubscriptionId: "sub-1",
    });

    unwrapOk(result);
    expect(mockContractsEdit).not.toHaveBeenCalled();
  });
});
