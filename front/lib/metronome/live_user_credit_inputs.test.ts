import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import { fetchLiveUserCreditInputs } from "@app/lib/metronome/live_user_credit_inputs";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockListMetronomeSeatBalances,
  mockFetchPerUserAwuUsage,
  mockGetMetronomePerUserCap,
  mockGetMetronomeDefaultUserCapAlertForSeatType,
} = vi.hoisted(() => ({
  mockListMetronomeSeatBalances: vi.fn(),
  mockFetchPerUserAwuUsage: vi.fn(),
  mockGetMetronomePerUserCap: vi.fn(),
  mockGetMetronomeDefaultUserCapAlertForSeatType: vi.fn(),
}));

vi.mock("@app/lib/metronome/client", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/client")
  >("@app/lib/metronome/client");
  return {
    ...actual,
    listMetronomeSeatBalances: mockListMetronomeSeatBalances,
  };
});

vi.mock("@app/lib/metronome/per_user_usage", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/per_user_usage")
  >("@app/lib/metronome/per_user_usage");
  return { ...actual, fetchPerUserAwuUsage: mockFetchPerUserAwuUsage };
});

vi.mock("@app/lib/metronome/alerts/spend_limits", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/alerts/spend_limits")
  >("@app/lib/metronome/alerts/spend_limits");
  return {
    ...actual,
    getMetronomePerUserCap: mockGetMetronomePerUserCap,
    getMetronomeDefaultUserCapAlertForSeatType:
      mockGetMetronomeDefaultUserCapAlertForSeatType,
  };
});

const CUSTOMER_ID = "cust_test";
const CONTRACT_ID = "ct_test";
const USER_ID = "user_test";

function seatBalance(balanceAwu: number, startingAwu: number) {
  return [
    {
      seat_id: USER_ID,
      balances: [
        {
          credit_type_id: getCreditTypeAwuId(),
          balance: balanceAwu,
          starting_balance: startingAwu,
        },
      ],
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchPerUserAwuUsage.mockResolvedValue(new Ok(new Map<string, number>()));
  mockGetMetronomePerUserCap.mockResolvedValue(new Ok(null));
  mockGetMetronomeDefaultUserCapAlertForSeatType.mockResolvedValue(
    new Ok(null)
  );
});

describe("fetchLiveUserCreditInputs", () => {
  it("reads the live seat balance for a seat-based user", async () => {
    mockListMetronomeSeatBalances.mockResolvedValue(
      new Ok(seatBalance(40000, 40000))
    );

    const result = await fetchLiveUserCreditInputs({
      workspaceId: "ws_test",
      userId: USER_ID,
      seatType: "max",
      metronomeCustomerId: CUSTOMER_ID,
      metronomeContractId: CONTRACT_ID,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.seatBalanceAwu).toBe(40000);
      expect(result.value.seatStartingBalanceAwu).toBe(40000);
      // No cap configured → cap fields null, usage not fetched.
      expect(result.value.effectiveCapAwuCredits).toBeNull();
      expect(result.value.capSource).toBe("none");
      expect(result.value.consumedAwuCredits).toBeNull();
    }
  });

  it("resolves the per-user cap override and consumed usage when configured", async () => {
    mockListMetronomeSeatBalances.mockResolvedValue(
      new Ok(seatBalance(0, 40000))
    );
    mockGetMetronomePerUserCap.mockResolvedValue(
      new Ok({ alert: { threshold: 50000 } })
    );
    mockFetchPerUserAwuUsage.mockResolvedValue(
      new Ok(new Map<string, number>([[USER_ID, 10000]]))
    );

    const result = await fetchLiveUserCreditInputs({
      workspaceId: "ws_test",
      userId: USER_ID,
      seatType: "max",
      metronomeCustomerId: CUSTOMER_ID,
      metronomeContractId: CONTRACT_ID,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.seatBalanceAwu).toBe(0);
      expect(result.value.effectiveCapAwuCredits).toBe(50000);
      expect(result.value.capSource).toBe("override");
      expect(result.value.consumedAwuCredits).toBe(10000);
    }
  });

  it("surfaces an Err when the live seat-balance read fails", async () => {
    mockListMetronomeSeatBalances.mockResolvedValue(
      new Err(new Error("metronome down"))
    );

    const result = await fetchLiveUserCreditInputs({
      workspaceId: "ws_test",
      userId: USER_ID,
      seatType: "max",
      metronomeCustomerId: CUSTOMER_ID,
      metronomeContractId: CONTRACT_ID,
    });

    expect(result.isErr()).toBe(true);
  });
});
