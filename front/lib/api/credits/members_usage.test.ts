import {
  fetchConsumedAwuCreditsByApiKeyName,
  fetchSeatDataForMembersTable,
  getEsConsumedAwuCreditsForUser,
  getEsConsumedProgrammaticAwuCredits,
} from "@app/lib/api/credits/members_usage";
import {
  searchAnalytics,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { USAGE_TYPE_PROGRAMMATIC } from "@app/lib/metronome/constants";
import {
  buildSeatDataByUserId,
  getCachedSeatDataByUserId,
} from "@app/lib/metronome/seats";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    searchAnalytics: vi.fn(),
    searchConsumptionAnalytics: vi.fn(),
  };
});

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

function esResponse(aggregations: unknown) {
  return new Ok({ aggregations }) as Awaited<
    ReturnType<typeof searchConsumptionAnalytics>
  >;
}

describe("fetchConsumedAwuCreditsByApiKeyName", () => {
  afterEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
  });

  it("sums consumption-index microcredits by API key name for the billing cycle", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const cycle = {
      cycleStart: new Date("2026-08-01T00:00:00.000Z"),
      cycleEnd: new Date("2026-09-01T00:00:00.000Z"),
    };
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      esResponse({
        by_api_key_name: {
          buckets: [
            { key: "Production", credits: { value: 2_000_000 } },
            { key: "Automation", credits: { value: 3_000_000 } },
          ],
        },
      })
    );

    const result = await fetchConsumedAwuCreditsByApiKeyName({
      workspace,
      apiKeyNames: ["Production", "Automation"],
      cycle,
    });

    expect(result).toEqual(
      new Map([
        ["Production", 2],
        ["Automation", 3],
      ])
    );
    expect(searchConsumptionAnalytics).toHaveBeenCalledWith(
      {
        bool: {
          filter: [
            { term: { workspace_id: workspace.sId } },
            { terms: { api_key_name: ["Production", "Automation"] } },
            {
              range: {
                completed_at: {
                  gte: cycle.cycleStart.toISOString(),
                  lte: cycle.cycleEnd.toISOString(),
                },
              },
            },
          ],
        },
      },
      {
        aggregations: {
          by_api_key_name: {
            terms: { field: "api_key_name", size: 2 },
            aggs: { credits: { sum: { field: "credit_micro" } } },
          },
        },
        size: 0,
      }
    );
  });
});

describe("getEsConsumedAwuCreditsForUser", () => {
  afterEach(() => {
    vi.mocked(searchAnalytics).mockReset();
    vi.mocked(searchConsumptionAnalytics).mockReset();
  });

  it("sums consumption-index microcredits attributed to the user", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const user = await UserFactory.basic();
    const cycle = {
      cycleStart: new Date("2026-08-01T00:00:00.000Z"),
      cycleEnd: new Date("2026-09-01T00:00:00.000Z"),
    };
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      esResponse({
        by_user: {
          buckets: [{ key: user.sId, credits: { value: 2_600_000 } }],
        },
      })
    );

    const result = await getEsConsumedAwuCreditsForUser(auth, {
      user,
      cycle,
    });

    expect(result).toBe(3);
    expect(searchConsumptionAnalytics).toHaveBeenCalledWith(
      {
        bool: {
          filter: [
            { term: { workspace_id: workspace.sId } },
            { terms: { "user.id": [user.sId] } },
            {
              range: {
                completed_at: {
                  gte: cycle.cycleStart.toISOString(),
                  lte: cycle.cycleEnd.toISOString(),
                },
              },
            },
          ],
        },
      },
      {
        aggregations: {
          by_user: {
            terms: { field: "user.id", size: 1 },
            aggs: { credits: { sum: { field: "credit_micro" } } },
          },
        },
        size: 0,
      }
    );
  });

  it("keeps free-seat lifetime usage on the seat-aware legacy index", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, {
      role: "user",
      seatType: "free",
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const cycle = {
      cycleStart: new Date(0),
      cycleEnd: new Date("3000-01-01T00:00:00.000Z"),
    };
    vi.mocked(searchAnalytics).mockResolvedValue(
      esResponse({
        by_user: {
          buckets: [{ key: user.sId, credits: { value: 26 } }],
        },
      })
    );

    const result = await getEsConsumedAwuCreditsForUser(auth, {
      user,
      cycle,
    });

    expect(result).toBe(26);
    expect(searchConsumptionAnalytics).not.toHaveBeenCalled();
    expect(searchAnalytics).toHaveBeenCalledWith(
      {
        bool: {
          filter: [
            { term: { workspace_id: workspace.sId } },
            { terms: { user_id: [user.sId] } },
            { term: { is_free_seat: true } },
            {
              range: {
                timestamp: {
                  gte: cycle.cycleStart.toISOString(),
                  lte: cycle.cycleEnd.toISOString(),
                },
              },
            },
          ],
        },
      },
      {
        aggregations: {
          by_user: {
            terms: { field: "user_id", size: 1 },
            aggs: { credits: { sum: { field: "cost.billable_awu" } } },
          },
        },
        size: 0,
      }
    );
  });
});

describe("getEsConsumedProgrammaticAwuCredits", () => {
  afterEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
  });

  it("sums consumption-index microcredits for programmatic usage in the billing cycle", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const cycle = {
      cycleStart: new Date("2026-08-01T00:00:00.000Z"),
      cycleEnd: new Date("2026-09-01T00:00:00.000Z"),
    };
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      esResponse({ credits: { value: 2_600_000 } })
    );

    const result = await getEsConsumedProgrammaticAwuCredits(auth, { cycle });

    expect(result).toBe(3);
    expect(searchConsumptionAnalytics).toHaveBeenCalledWith(
      {
        bool: {
          filter: [
            { term: { workspace_id: workspace.sId } },
            { term: { usage_type: USAGE_TYPE_PROGRAMMATIC } },
            {
              range: {
                completed_at: {
                  gte: cycle.cycleStart.toISOString(),
                  lte: cycle.cycleEnd.toISOString(),
                },
              },
            },
          ],
        },
      },
      {
        aggregations: { credits: { sum: { field: "credit_micro" } } },
        size: 0,
      }
    );
  });
});

// Regression tests for the Metronome 429 storm of 2026-08: a failing cached
// seat-data read must degrade to an empty map, never trigger a second
// (uncached) Metronome fan-out.
describe("fetchSeatDataForMembersTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("degrades to an empty map when the cached read fails, without an uncached refetch", async () => {
    vi.mocked(getCachedSeatDataByUserId).mockResolvedValue(
      new Err(new Error("429 rate limit exceeded"))
    );

    const result = await fetchSeatDataForMembersTable({
      metronomeCustomerId: "cust_1",
      metronomeContractId: "contract_1",
    });

    expect(result).toEqual(new Map());
    expect(buildSeatDataByUserId).not.toHaveBeenCalled();
  });

  it("degrades to an empty map when another process holds the fetch lock", async () => {
    vi.mocked(getCachedSeatDataByUserId).mockResolvedValue(new Ok(null));

    const result = await fetchSeatDataForMembersTable({
      metronomeCustomerId: "cust_1",
      metronomeContractId: "contract_1",
    });

    expect(result).toEqual(new Map());
    expect(buildSeatDataByUserId).not.toHaveBeenCalled();
  });

  it("returns the cached seat data keyed by user id", async () => {
    vi.mocked(getCachedSeatDataByUserId).mockResolvedValue(
      new Ok({
        user_1: {
          awuAllocation: 5000,
          billingFrequency: "MONTHLY",
          nextCreditResetAt: "2026-09-01T00:00:00.000Z",
        },
      })
    );

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
