import { carryOverContractBalancesOnRenewal } from "@app/lib/metronome/renewal_carry_over";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockListCommits,
  mockListCredits,
  mockAddComplimentaryCommit,
  mockAddCredit,
} = vi.hoisted(() => ({
  mockListCommits: vi.fn(),
  mockListCredits: vi.fn(),
  mockAddComplimentaryCommit: vi.fn(),
  mockAddCredit: vi.fn(),
}));

vi.mock("@app/lib/metronome/client", () => ({
  listContractCommitsWithLedger: mockListCommits,
  listContractCreditsWithLedger: mockListCredits,
  addComplimentaryCommitToContract: mockAddComplimentaryCommit,
  addCreditToContract: mockAddCredit,
}));

vi.mock("@app/logger/logger", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const CARRY_KEY = "DUST_CARRY_ON_RENEWAL";

const TO_CONTRACT_START = new Date("2026-05-01T00:00:00.000Z");
const ORIGINAL_ENDING = "2027-04-01T00:00:00.000Z";

function flaggedCommit(overrides: Record<string, unknown> = {}) {
  return {
    id: "commit-1",
    type: "PREPAID",
    product: { id: "prod-awu", name: "Prepaid" },
    priority: 300,
    name: "Credit top-up: 10,000 credits",
    balance: 0,
    // ISO value = finite expiry; the carry uses this, not the (clamped) window.
    custom_fields: { [CARRY_KEY]: ORIGINAL_ENDING },
    applicable_product_tags: ["usage"],
    access_schedule: {
      credit_type: { id: "credit-awu" },
      schedule_items: [
        {
          id: "seg-1",
          amount: 10_000,
          starting_at: "2026-04-01T00:00:00.000Z",
          ending_before: ORIGINAL_ENDING,
        },
      ],
    },
    ledger: [
      { type: "PREPAID_COMMIT_SEGMENT_START", amount: 10_000 },
      { type: "PREPAID_COMMIT_AUTOMATED_INVOICE_DEDUCTION", amount: -6_000 },
      { type: "PREPAID_COMMIT_EXPIRATION", amount: -4_000 },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  mockListCommits.mockReset();
  mockListCredits.mockReset();
  mockAddComplimentaryCommit.mockReset();
  mockAddCredit.mockReset();
  mockListCommits.mockResolvedValue(new Ok([]));
  mockListCredits.mockResolvedValue(new Ok([]));
  mockAddComplimentaryCommit.mockResolvedValue(new Ok({ editId: "edit-1" }));
  mockAddCredit.mockResolvedValue(new Ok({ creditId: "credit-1" }));
});

async function run() {
  return carryOverContractBalancesOnRenewal({
    metronomeCustomerId: "cust-1",
    fromContractId: "from-1",
    toContractId: "to-1",
    toContractStart: TO_CONTRACT_START,
  });
}

describe("carryOverContractBalancesOnRenewal", () => {
  it("carries the unused balance from the expiration ledger entry, not the granted amount", async () => {
    mockListCommits.mockResolvedValue(new Ok([flaggedCommit()]));

    const result = await run();

    expect(result.isOk()).toBe(true);
    expect(mockAddComplimentaryCommit).toHaveBeenCalledTimes(1);
    const call = mockAddComplimentaryCommit.mock.calls[0][0];
    // 10,000 granted − 6,000 used = 4,000 left (from the -4,000 expiration entry).
    expect(call.accessAmount).toBe(4_000);
    expect(call.metronomeContractId).toBe("to-1");
    expect(call.productId).toBe("prod-awu");
    expect(call.priority).toBe(300);
    expect(call.accessStartingAt).toEqual(TO_CONTRACT_START);
    // Expiry comes from the custom field, and is re-stamped verbatim.
    expect(call.accessEndingBefore).toEqual(new Date(ORIGINAL_ENDING));
    expect(call.uniquenessKey).toBe("carry:to-1:commit-1");
    expect(call.customFields).toEqual({ [CARRY_KEY]: ORIGINAL_ENDING });
  });

  it("falls back to the live balance when no expiration entry is present", async () => {
    mockListCommits.mockResolvedValue(
      new Ok([
        flaggedCommit({
          balance: 7_500,
          ledger: [{ type: "PREPAID_COMMIT_SEGMENT_START", amount: 10_000 }],
        }),
      ])
    );

    await run();

    expect(mockAddComplimentaryCommit.mock.calls[0][0].accessAmount).toBe(
      7_500
    );
  });

  it("skips commits that are not flagged", async () => {
    mockListCommits.mockResolvedValue(
      new Ok([flaggedCommit({ custom_fields: {} })])
    );

    await run();

    expect(mockAddComplimentaryCommit).not.toHaveBeenCalled();
  });

  it("carries forever (far-future sentinel) when the flag has no ISO date", async () => {
    mockListCommits.mockResolvedValue(
      new Ok([flaggedCommit({ custom_fields: { [CARRY_KEY]: "forever" } })])
    );

    await run();

    expect(mockAddComplimentaryCommit).toHaveBeenCalledTimes(1);
    const call = mockAddComplimentaryCommit.mock.calls[0][0];
    expect(call.accessAmount).toBe(4_000);
    expect(call.accessEndingBefore).toEqual(
      new Date("2999-01-01T00:00:00.000Z")
    );
    // The forever marker is re-stamped so it stays forever on the next renewal.
    expect(call.customFields).toEqual({ [CARRY_KEY]: "forever" });
  });

  it("skips when the stored expiry is already in the past", async () => {
    mockListCommits.mockResolvedValue(
      new Ok([
        flaggedCommit({
          // Earlier than the new contract start (2026-05-01) → lapsed.
          custom_fields: { [CARRY_KEY]: "2026-04-01T00:00:00.000Z" },
        }),
      ])
    );

    await run();

    expect(mockAddComplimentaryCommit).not.toHaveBeenCalled();
  });

  it("skips commits with no remaining balance", async () => {
    mockListCommits.mockResolvedValue(
      new Ok([
        flaggedCommit({
          balance: 0,
          ledger: [
            { type: "PREPAID_COMMIT_SEGMENT_START", amount: 10_000 },
            {
              type: "PREPAID_COMMIT_AUTOMATED_INVOICE_DEDUCTION",
              amount: -10_000,
            },
            { type: "PREPAID_COMMIT_EXPIRATION", amount: 0 },
          ],
        }),
      ])
    );

    await run();

    expect(mockAddComplimentaryCommit).not.toHaveBeenCalled();
  });

  it("re-grants a flagged credit as a credit with the carry flag", async () => {
    mockListCredits.mockResolvedValue(
      new Ok([
        {
          id: "credit-9",
          type: "CREDIT",
          product: { id: "prod-awu", name: "Credit" },
          priority: 300,
          name: "Negotiated credit",
          balance: 0,
          custom_fields: { [CARRY_KEY]: ORIGINAL_ENDING },
          applicable_product_tags: ["usage"],
          access_schedule: {
            credit_type: { id: "credit-awu" },
            schedule_items: [
              {
                id: "seg-1",
                amount: 5_000,
                starting_at: "2026-04-01T00:00:00.000Z",
                ending_before: ORIGINAL_ENDING,
              },
            ],
          },
          ledger: [{ type: "CREDIT_EXPIRATION", amount: -1_250 }],
        },
      ])
    );

    await run();

    expect(mockAddComplimentaryCommit).not.toHaveBeenCalled();
    expect(mockAddCredit).toHaveBeenCalledTimes(1);
    const call = mockAddCredit.mock.calls[0][0];
    expect(call.amount).toBe(1_250);
    expect(call.creditTypeId).toBe("credit-awu");
    expect(call.uniquenessKey).toBe("carry:to-1:credit-9");
    expect(call.customFields).toEqual({ [CARRY_KEY]: ORIGINAL_ENDING });
  });

  it("propagates a re-grant failure", async () => {
    mockListCommits.mockResolvedValue(new Ok([flaggedCommit()]));
    mockAddComplimentaryCommit.mockResolvedValue(new Err(new Error("boom")));

    const result = await run();

    expect(result.isErr()).toBe(true);
  });
});
