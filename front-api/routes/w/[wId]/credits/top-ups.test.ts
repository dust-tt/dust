import * as metronomeClient from "@app/lib/metronome/client";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import type { MetronomeBalance } from "@app/lib/metronome/types";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/client", async () => {
  const actual = await vi.importActual<typeof metronomeClient>(
    "@app/lib/metronome/client"
  );
  return {
    ...actual,
    listMetronomeBalances: vi.fn(),
  };
});

// The seat-product filter goes through Redis-cached Metronome lookups that
// are unavailable in tests; with no active contract the filter is a no-op.
vi.mock("@app/lib/metronome/plan_type", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/plan_type")
  >("@app/lib/metronome/plan_type");
  return {
    ...actual,
    getActiveContract: vi.fn().mockResolvedValue(null),
  };
});

vi.mock("@app/lib/metronome/seat_types", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/seat_types")
  >("@app/lib/metronome/seat_types");
  return {
    ...actual,
    getProductSeatTypes: vi.fn().mockResolvedValue(new Map()),
  };
});

function topUpsUrl(wId: string) {
  return `/api/w/${wId}/credits/top-ups`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW_MS = Date.now();
const TWO_MONTHS_AGO = new Date(NOW_MS - 60 * DAY_MS).toISOString();
const ONE_MONTH_AGO = new Date(NOW_MS - 30 * DAY_MS).toISOString();
const ONE_WEEK_AGO = new Date(NOW_MS - 7 * DAY_MS).toISOString();
const NEXT_MONTH = new Date(NOW_MS + 30 * DAY_MS).toISOString();
const NEXT_YEAR = new Date(NOW_MS + 365 * DAY_MS).toISOString();

function makeAwuCredit({
  name,
  scheduleItems,
  contractId,
}: {
  name: string;
  scheduleItems: { amount: number; startingAt: string; endingBefore: string }[];
  contractId?: string;
}): MetronomeBalance {
  return {
    id: `credit-${name}`,
    type: "CREDIT",
    product: { id: "product-pool", name: "Credits" },
    ...(contractId ? { contract: { id: contractId } } : {}),
    access_schedule: {
      credit_type: { id: getCreditTypeAwuId(), name: "AWU" },
      schedule_items: scheduleItems.map((item, i) => ({
        id: `item-${name}-${i}`,
        amount: item.amount,
        starting_at: item.startingAt,
        ending_before: item.endingBefore,
      })),
    },
    name,
  };
}

beforeEach(() => {
  vi.mocked(metronomeClient.listMetronomeBalances).mockResolvedValue(
    new Ok([])
  );
});

describe("GET /api/w/[wId]/credits/top-ups", () => {
  it("returns 403 when the caller is a user", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(topUpsUrl(workspace.sId));

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
    expect(metronomeClient.listMetronomeBalances).not.toHaveBeenCalled();
  });

  it("returns the granted top-ups, most recent first, excluding future grants", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    vi.mocked(metronomeClient.listMetronomeBalances).mockResolvedValue(
      new Ok([
        makeAwuCredit({
          name: "Coupon: WELCOME100",
          scheduleItems: [
            {
              amount: 1000,
              startingAt: TWO_MONTHS_AGO,
              endingBefore: NEXT_MONTH,
            },
          ],
        }),
        // Recurring free credits: the future period is not a top-up yet.
        makeAwuCredit({
          name: "Free Monthly Credits",
          scheduleItems: [
            {
              amount: 500,
              startingAt: ONE_MONTH_AGO,
              endingBefore: NEXT_MONTH,
            },
            { amount: 500, startingAt: NEXT_MONTH, endingBefore: NEXT_YEAR },
          ],
        }),
        makeAwuCredit({
          name: "Credit top-up: 5,000 credits",
          scheduleItems: [
            { amount: 5000, startingAt: ONE_WEEK_AGO, endingBefore: NEXT_YEAR },
          ],
          contractId: "test-metronome-contract-id",
        }),
        // Grant on another contract: excluded.
        makeAwuCredit({
          name: "Other contract grant",
          scheduleItems: [
            {
              amount: 42,
              startingAt: TWO_MONTHS_AGO,
              endingBefore: NEXT_MONTH,
            },
          ],
          contractId: "some-other-contract-id",
        }),
      ])
    );

    const response = await honoApp.request(topUpsUrl(workspace.sId));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.topUps).toEqual([
      {
        name: "Credit top-up: 5,000 credits",
        amountCredits: 5000,
        grantedAtMs: new Date(ONE_WEEK_AGO).getTime(),
        expiresAtMs: new Date(NEXT_YEAR).getTime(),
      },
      {
        name: "Free Monthly Credits",
        amountCredits: 500,
        grantedAtMs: new Date(ONE_MONTH_AGO).getTime(),
        expiresAtMs: new Date(NEXT_MONTH).getTime(),
      },
      {
        name: "Coupon: WELCOME100",
        amountCredits: 1000,
        grantedAtMs: new Date(TWO_MONTHS_AGO).getTime(),
        expiresAtMs: new Date(NEXT_MONTH).getTime(),
      },
    ]);
  });
});
