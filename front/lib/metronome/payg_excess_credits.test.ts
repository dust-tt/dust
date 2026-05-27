import { setAwuContractExcessCreditsAmount } from "@app/lib/metronome/payg_excess_credits";
import { Err, Ok } from "@app/types/shared/result";
import type { ContractV2 } from "@metronome/sdk/resources";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEditMetronomeContract,
  mockGetMetronomeContractById,
  mockListMetronomeContracts,
} = vi.hoisted(() => ({
  mockEditMetronomeContract: vi.fn(),
  mockGetMetronomeContractById: vi.fn(),
  mockListMetronomeContracts: vi.fn(),
}));

vi.mock("@app/lib/metronome/client", () => ({
  editMetronomeContract: mockEditMetronomeContract,
  getMetronomeContractById: mockGetMetronomeContractById,
  listMetronomeContracts: mockListMetronomeContracts,
}));

const AWU_CREDIT_TYPE_ID = "awu-credit-type";
const PROG_USD_CREDIT_TYPE_ID = "prog-usd-credit-type";

vi.mock("@app/lib/metronome/constants", () => ({
  getProductExcessCreditsId: () => "excess-product-id",
  getCreditTypeAwuId: () => AWU_CREDIT_TYPE_ID,
}));

const EXCESS_PRODUCT = { id: "excess-product-id", name: "Excess Credits" };
const OTHER_PRODUCT = { id: "other-product-id", name: "Other" };

function makeContract({
  id,
  recurringCredits,
  credits,
}: {
  id: string;
  recurringCredits?: Array<{
    id: string;
    productId: string;
    creditTypeId?: string;
  }>;
  credits?: Array<{
    id: string;
    recurringCreditId?: string;
    productId: string;
    scheduleItems?: Array<{
      id: string;
      amount: number;
      startingAt: string;
      endingBefore: string;
    }>;
  }>;
}): ContractV2 {
  return {
    id,
    recurring_credits: (recurringCredits ?? []).map((rc) => ({
      id: rc.id,
      product: { id: rc.productId, name: "x" },
      access_amount: {
        credit_type_id: rc.creditTypeId ?? AWU_CREDIT_TYPE_ID,
        unit_price: 5000,
        quantity: 1,
      },
    })),
    credits: (credits ?? []).map((c) => ({
      id: c.id,
      type: "CREDIT",
      product: { id: c.productId, name: "x" },
      recurring_credit_id: c.recurringCreditId,
      access_schedule: {
        schedule_items: (c.scheduleItems ?? []).map((s) => ({
          id: s.id,
          amount: s.amount,
          starting_at: s.startingAt,
          ending_before: s.endingBefore,
        })),
      },
    })),
  } as unknown as ContractV2;
}

const CUSTOMER_ID = "cust_1";
const WORKSPACE_ID = "ws_1";

describe("payg_excess_credits", () => {
  beforeEach(() => {
    mockEditMetronomeContract.mockReset();
    mockGetMetronomeContractById.mockReset();
    mockListMetronomeContracts.mockReset();
  });

  it("disable zeros recurring unit_price and current/future segments only", async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24);
    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 60);

    mockListMetronomeContracts.mockResolvedValue(
      new Ok([{ id: "contract_1" } as ContractV2])
    );
    mockGetMetronomeContractById.mockResolvedValue(
      new Ok(
        makeContract({
          id: "contract_1",
          recurringCredits: [{ id: "rc_excess", productId: EXCESS_PRODUCT.id }],
          credits: [
            {
              id: "credit_current",
              recurringCreditId: "rc_excess",
              productId: EXCESS_PRODUCT.id,
              scheduleItems: [
                {
                  id: "seg_past",
                  amount: 5000,
                  startingAt: past.toISOString(),
                  endingBefore: past.toISOString(),
                },
                {
                  id: "seg_current",
                  amount: 5000,
                  startingAt: past.toISOString(),
                  endingBefore: future.toISOString(),
                },
                {
                  id: "seg_future",
                  amount: 5000,
                  startingAt: future.toISOString(),
                  endingBefore: farFuture.toISOString(),
                },
              ],
            },
          ],
        })
      )
    );
    mockEditMetronomeContract.mockResolvedValue(new Ok({ editId: "edit_1" }));

    const result = await setAwuContractExcessCreditsAmount({
      metronomeCustomerId: CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
      amount: 0,
    });

    expect(result.isOk()).toBe(true);
    expect(mockEditMetronomeContract).toHaveBeenCalledTimes(1);
    const callArg = mockEditMetronomeContract.mock.calls[0][0];
    expect(callArg.customer_id).toBe(CUSTOMER_ID);
    expect(callArg.contract_id).toBe("contract_1");
    expect(callArg.update_recurring_credits).toEqual([
      {
        recurring_credit_id: "rc_excess",
        access_amount: { unit_price: 0, quantity: 1 },
      },
    ]);
    expect(callArg.update_credits).toHaveLength(1);
    const updatedSegmentIds =
      callArg.update_credits[0].access_schedule.update_schedule_items
        .map((s: { id: string }) => s.id)
        .sort();
    expect(updatedSegmentIds).toEqual(["seg_current", "seg_future"]);
    expect(
      callArg.update_credits[0].access_schedule.update_schedule_items.every(
        (s: { amount: number }) => s.amount === 0
      )
    ).toBe(true);
  });

  it("restore sets recurring unit_price and segments back to default", async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24);

    mockListMetronomeContracts.mockResolvedValue(
      new Ok([{ id: "contract_1" } as ContractV2])
    );
    mockGetMetronomeContractById.mockResolvedValue(
      new Ok(
        makeContract({
          id: "contract_1",
          recurringCredits: [{ id: "rc_excess", productId: EXCESS_PRODUCT.id }],
          credits: [
            {
              id: "credit_current",
              recurringCreditId: "rc_excess",
              productId: EXCESS_PRODUCT.id,
              scheduleItems: [
                {
                  id: "seg_current",
                  amount: 0,
                  startingAt: past.toISOString(),
                  endingBefore: future.toISOString(),
                },
              ],
            },
          ],
        })
      )
    );
    mockEditMetronomeContract.mockResolvedValue(new Ok({ editId: "edit_2" }));

    const result = await setAwuContractExcessCreditsAmount({
      metronomeCustomerId: CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
      amount: 5000,
    });

    expect(result.isOk()).toBe(true);
    const callArg = mockEditMetronomeContract.mock.calls[0][0];
    expect(callArg.update_recurring_credits).toEqual([
      {
        recurring_credit_id: "rc_excess",
        access_amount: { unit_price: 5000, quantity: 1 },
      },
    ]);
    expect(
      callArg.update_credits[0].access_schedule.update_schedule_items
    ).toEqual([{ id: "seg_current", amount: 5000 }]);
  });

  it("no-op when no active contracts", async () => {
    mockListMetronomeContracts.mockResolvedValue(new Ok([]));

    const result = await setAwuContractExcessCreditsAmount({
      metronomeCustomerId: CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
      amount: 0,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.updatedContracts).toBe(0);
    }
    expect(mockEditMetronomeContract).not.toHaveBeenCalled();
  });

  it("skips contracts without an excess recurring credit", async () => {
    mockListMetronomeContracts.mockResolvedValue(
      new Ok([{ id: "contract_no_excess" } as ContractV2])
    );
    mockGetMetronomeContractById.mockResolvedValue(
      new Ok(
        makeContract({
          id: "contract_no_excess",
          recurringCredits: [{ id: "rc_other", productId: OTHER_PRODUCT.id }],
          credits: [],
        })
      )
    );

    const result = await setAwuContractExcessCreditsAmount({
      metronomeCustomerId: CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
      amount: 0,
    });

    expect(result.isOk()).toBe(true);
    expect(mockEditMetronomeContract).not.toHaveBeenCalled();
  });

  it("skips legacy programmatic USD excess recurring credits", async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24);

    mockListMetronomeContracts.mockResolvedValue(
      new Ok([{ id: "contract_legacy" } as ContractV2])
    );
    mockGetMetronomeContractById.mockResolvedValue(
      new Ok(
        makeContract({
          id: "contract_legacy",
          recurringCredits: [
            {
              id: "rc_excess_legacy",
              productId: EXCESS_PRODUCT.id,
              creditTypeId: PROG_USD_CREDIT_TYPE_ID,
            },
          ],
          credits: [
            {
              id: "credit_legacy",
              recurringCreditId: "rc_excess_legacy",
              productId: EXCESS_PRODUCT.id,
              scheduleItems: [
                {
                  id: "seg_current",
                  amount: 50,
                  startingAt: past.toISOString(),
                  endingBefore: future.toISOString(),
                },
              ],
            },
          ],
        })
      )
    );

    const result = await setAwuContractExcessCreditsAmount({
      metronomeCustomerId: CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
      amount: 0,
    });

    expect(result.isOk()).toBe(true);
    expect(mockEditMetronomeContract).not.toHaveBeenCalled();
  });

  it("updates recurring credit even when no active child segments exist", async () => {
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24);

    mockListMetronomeContracts.mockResolvedValue(
      new Ok([{ id: "contract_1" } as ContractV2])
    );
    mockGetMetronomeContractById.mockResolvedValue(
      new Ok(
        makeContract({
          id: "contract_1",
          recurringCredits: [{ id: "rc_excess", productId: EXCESS_PRODUCT.id }],
          credits: [
            {
              id: "credit_expired",
              recurringCreditId: "rc_excess",
              productId: EXCESS_PRODUCT.id,
              scheduleItems: [
                {
                  id: "seg_past",
                  amount: 5000,
                  startingAt: past.toISOString(),
                  endingBefore: past.toISOString(),
                },
              ],
            },
          ],
        })
      )
    );
    mockEditMetronomeContract.mockResolvedValue(new Ok({ editId: "edit_3" }));

    const result = await setAwuContractExcessCreditsAmount({
      metronomeCustomerId: CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
      amount: 0,
    });

    expect(result.isOk()).toBe(true);
    expect(mockEditMetronomeContract).toHaveBeenCalledTimes(1);
    const callArg = mockEditMetronomeContract.mock.calls[0][0];
    expect(callArg.update_recurring_credits).toHaveLength(1);
    expect(callArg.update_credits).toBeUndefined();
  });

  it("propagates list error", async () => {
    mockListMetronomeContracts.mockResolvedValue(new Err(new Error("boom")));

    const result = await setAwuContractExcessCreditsAmount({
      metronomeCustomerId: CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
      amount: 0,
    });

    expect(result.isErr()).toBe(true);
    expect(mockEditMetronomeContract).not.toHaveBeenCalled();
  });

  it("propagates edit error", async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24);

    mockListMetronomeContracts.mockResolvedValue(
      new Ok([{ id: "contract_1" } as ContractV2])
    );
    mockGetMetronomeContractById.mockResolvedValue(
      new Ok(
        makeContract({
          id: "contract_1",
          recurringCredits: [{ id: "rc_excess", productId: EXCESS_PRODUCT.id }],
          credits: [
            {
              id: "credit_current",
              recurringCreditId: "rc_excess",
              productId: EXCESS_PRODUCT.id,
              scheduleItems: [
                {
                  id: "seg_current",
                  amount: 5000,
                  startingAt: past.toISOString(),
                  endingBefore: future.toISOString(),
                },
              ],
            },
          ],
        })
      )
    );
    mockEditMetronomeContract.mockResolvedValue(
      new Err(new Error("edit-failed"))
    );

    const result = await setAwuContractExcessCreditsAmount({
      metronomeCustomerId: CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
      amount: 0,
    });

    expect(result.isErr()).toBe(true);
  });
});
