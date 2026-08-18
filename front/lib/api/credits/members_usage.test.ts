import { fetchSeatDataForMembersTable } from "@app/lib/api/credits/members_usage";
import {
  buildSeatDataByUserId,
  getCachedSeatDataByUserId,
} from "@app/lib/metronome/seats";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/seats", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/seats")
  >("@app/lib/metronome/seats");
  return {
    ...actual,
    getCachedSeatDataByUserId: vi.fn(),
    buildSeatDataByUserId: vi.fn(),
  };
});

// Regression tests for the Metronome 429 storm of 2026-08: a failing cached
// seat-data read must degrade to an empty map, never trigger a second
// (uncached) Metronome fan-out.
describe("fetchSeatDataForMembersTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("degrades to an empty map when the cached read fails, without an uncached refetch", async () => {
    vi.mocked(getCachedSeatDataByUserId).mockRejectedValue(
      new Error("429 rate limit exceeded")
    );

    const result = await fetchSeatDataForMembersTable({
      metronomeCustomerId: "cust_1",
      metronomeContractId: "contract_1",
    });

    expect(result).toEqual(new Map());
    expect(buildSeatDataByUserId).not.toHaveBeenCalled();
  });

  it("degrades to an empty map when another process holds the fetch lock", async () => {
    vi.mocked(getCachedSeatDataByUserId).mockResolvedValue(null);

    const result = await fetchSeatDataForMembersTable({
      metronomeCustomerId: "cust_1",
      metronomeContractId: "contract_1",
    });

    expect(result).toEqual(new Map());
    expect(buildSeatDataByUserId).not.toHaveBeenCalled();
  });

  it("returns the cached seat data keyed by user id", async () => {
    vi.mocked(getCachedSeatDataByUserId).mockResolvedValue({
      user_1: {
        awuAllocation: 5000,
        billingFrequency: "MONTHLY",
        nextCreditResetAt: "2026-09-01T00:00:00.000Z",
      },
    });

    const result = await fetchSeatDataForMembersTable({
      metronomeCustomerId: "cust_1",
      metronomeContractId: "contract_1",
    });

    expect(result.get("user_1")).toEqual({
      awuAllocation: 5000,
      billingFrequency: "MONTHLY",
      nextCreditResetAt: "2026-09-01T00:00:00.000Z",
    });
  });
});
