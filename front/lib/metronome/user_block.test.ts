import { FREE_NO_PLAN_DATA } from "@app/lib/plans/free_plans";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import type { MaxAwuCreditsTimeframeType } from "@app/types/plan";
import {
  getFairUseAwuCreditsStatus,
  getWorkspaceCreditPoolStatus,
  isUserBlocked,
} from "@app/lib/metronome/user_block";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redisValues,
  mockFetchWorkspaceById,
  mockFetchUserById,
  mockGetActiveMembershipOfUserInWorkspace,
  mockGetRateLimiterCount,
  mockRunOnRedis,
} = vi.hoisted(() => {
  const redisValues = new Map<string, string>();

  const mockRunOnRedis = vi.fn(
    async (
      _params: { origin: string },
      callback: (client: {
        get: (key: string) => Promise<string | null>;
        set: (key: string, value: string) => Promise<void>;
      }) => Promise<unknown>
    ) =>
      callback({
        get: async (key: string) => redisValues.get(key) ?? null,
        set: async (key: string, value: string) => {
          redisValues.set(key, value);
        },
      })
  );

  return {
    redisValues,
    mockFetchWorkspaceById: vi.fn(),
    mockFetchUserById: vi.fn(),
    mockGetActiveMembershipOfUserInWorkspace: vi.fn(),
    mockGetRateLimiterCount: vi.fn(),
    mockRunOnRedis,
  };
});

vi.mock("@app/lib/api/redis", () => ({
  runOnRedis: mockRunOnRedis,
}));

vi.mock("@app/lib/resources/workspace_resource", () => ({
  WorkspaceResource: {
    fetchById: mockFetchWorkspaceById,
  },
}));

vi.mock("@app/lib/resources/user_resource", () => ({
  UserResource: {
    fetchById: mockFetchUserById,
  },
}));

vi.mock("@app/lib/resources/membership_resource", () => ({
  MembershipResource: {
    getActiveMembershipOfUserInWorkspace:
      mockGetActiveMembershipOfUserInWorkspace,
  },
}));

vi.mock("@app/lib/workspace", () => ({
  renderLightWorkspaceType: vi.fn(({ workspace }) => workspace),
}));

vi.mock("@app/lib/utils/rate_limiter", () => ({
  expireRateLimiterKey: vi.fn(),
  getRateLimiterCount: mockGetRateLimiterCount,
  getTimeframeSecondsFromLiteral: vi.fn(() => 60 * 60 * 24),
}));

vi.mock("@app/logger/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("isUserBlocked", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisValues.clear();
  });

  it("returns 'user_cap_reached' from Redis when user is capped and pool is active", async () => {
    redisValues.set("metronome:user_credit_state:ws_test:u_test", "capped");
    redisValues.set("metronome:pool_credit_status:ws_test", "active");

    const blocked = await isUserBlocked("ws_test", "u_test");

    expect(blocked).toBe("user_cap_reached");
    expect(mockFetchWorkspaceById).not.toHaveBeenCalled();
    expect(mockFetchUserById).not.toHaveBeenCalled();
    expect(mockGetActiveMembershipOfUserInWorkspace).not.toHaveBeenCalled();
  });

  it("returns 'credits_exhausted' when the pool is depleted, even if user is also capped", async () => {
    redisValues.set("metronome:user_credit_state:ws_test:u_test", "capped");
    redisValues.set("metronome:pool_credit_status:ws_test", "depleted");

    const blocked = await isUserBlocked("ws_test", "u_test");

    expect(blocked).toBe("credits_exhausted");
  });

  it("returns null when user is on_pool and pool is active", async () => {
    redisValues.set("metronome:user_credit_state:ws_test:u_test", "on_pool");
    redisValues.set("metronome:pool_credit_status:ws_test", "active");

    const blocked = await isUserBlocked("ws_test", "u_test");

    expect(blocked).toBeNull();
  });

  it("does not block a 'user_seat' user when the pool is depleted", async () => {
    redisValues.set("metronome:user_credit_state:ws_test:u_test", "user_seat");
    redisValues.set("metronome:pool_credit_status:ws_test", "depleted");

    const blocked = await isUserBlocked("ws_test", "u_test");

    expect(blocked).toBeNull();
  });

  it("does not block a 'user_seat_low_balance' user when the pool is depleted", async () => {
    redisValues.set(
      "metronome:user_credit_state:ws_test:u_test",
      "user_seat_low_balance"
    );
    redisValues.set("metronome:pool_credit_status:ws_test", "depleted");

    const blocked = await isUserBlocked("ws_test", "u_test");

    expect(blocked).toBeNull();
  });

  it("blocks an 'on_pool' user when the pool is depleted", async () => {
    redisValues.set("metronome:user_credit_state:ws_test:u_test", "on_pool");
    redisValues.set("metronome:pool_credit_status:ws_test", "depleted");

    const blocked = await isUserBlocked("ws_test", "u_test");

    expect(blocked).toBe("credits_exhausted");
  });

  it("does not block a warned 'on_pool_low_balance' user when pool is active", async () => {
    redisValues.set(
      "metronome:user_credit_state:ws_test:u_test",
      "on_pool_low_balance"
    );
    redisValues.set("metronome:pool_credit_status:ws_test", "active");

    const blocked = await isUserBlocked("ws_test", "u_test");

    expect(blocked).toBeNull();
  });

  it("blocks an 'on_pool_low_balance' user when pool is depleted", async () => {
    redisValues.set(
      "metronome:user_credit_state:ws_test:u_test",
      "on_pool_low_balance"
    );
    redisValues.set("metronome:pool_credit_status:ws_test", "depleted");

    const blocked = await isUserBlocked("ws_test", "u_test");

    expect(blocked).toBe("credits_exhausted");
  });

  it.each([
    "active_low_balance",
    "active_critical_balance",
    "overage",
  ] as const)("does not block when pool status is '%s' (non-depleted warning state)", async (poolState) => {
    redisValues.set("metronome:user_credit_state:ws_test:u_test", "on_pool");
    redisValues.set("metronome:pool_credit_status:ws_test", poolState);

    const blocked = await isUserBlocked("ws_test", "u_test");

    expect(blocked).toBeNull();
  });

  it("falls back to DB when 'user_credit_state' Redis value is invalid", async () => {
    redisValues.set(
      "metronome:user_credit_state:ws_test:u_test",
      "not_a_valid_state"
    );
    redisValues.set("metronome:pool_credit_status:ws_test", "active");

    mockFetchUserById.mockResolvedValue({ sId: "u_test", id: 7 });
    mockFetchWorkspaceById.mockResolvedValue({
      sId: "ws_test",
      id: 42,
      poolCreditState: "active",
    });
    mockGetActiveMembershipOfUserInWorkspace.mockResolvedValue({
      creditState: "capped",
    });

    const blocked = await isUserBlocked("ws_test", "u_test");

    expect(blocked).toBe("user_cap_reached");
    expect(mockFetchUserById).toHaveBeenCalled();
  });

  it("defaults to 'on_pool' and returns null when user is not found in DB fallback", async () => {
    mockFetchUserById.mockResolvedValue(null);
    mockFetchWorkspaceById.mockResolvedValue({
      sId: "ws_test",
      id: 42,
      poolCreditState: "active",
    });

    const blocked = await isUserBlocked("ws_test", "u_test");

    expect(blocked).toBeNull();
    expect(redisValues.get("metronome:pool_credit_status:ws_test")).toBe(
      "active"
    );
  });

  it("defaults to 'on_pool' and returns null when membership is not found in DB fallback", async () => {
    mockFetchUserById.mockResolvedValue({ sId: "u_test", id: 7 });
    mockFetchWorkspaceById.mockResolvedValue({
      sId: "ws_test",
      id: 42,
      poolCreditState: "active",
    });
    mockGetActiveMembershipOfUserInWorkspace.mockResolvedValue(null);

    const blocked = await isUserBlocked("ws_test", "u_test");

    expect(blocked).toBeNull();
  });

  it("falls back to DB on cold cache and repopulates both keys", async () => {
    mockFetchWorkspaceById.mockResolvedValue({
      sId: "ws_test",
      id: 42,
      poolCreditState: "active",
    });
    mockFetchUserById.mockResolvedValue({ sId: "u_test", id: 7 });
    mockGetActiveMembershipOfUserInWorkspace.mockResolvedValue({
      creditState: "capped",
    });

    const blocked = await isUserBlocked("ws_test", "u_test");

    expect(blocked).toBe("user_cap_reached");
    expect(redisValues.get("metronome:user_credit_state:ws_test:u_test")).toBe(
      "capped"
    );
    expect(redisValues.get("metronome:pool_credit_status:ws_test")).toBe(
      "active"
    );
  });

  it("falls back to DB when one cache key is missing and heals it", async () => {
    redisValues.set("metronome:user_credit_state:ws_test:u_test", "on_pool");

    mockFetchWorkspaceById.mockResolvedValue({
      sId: "ws_test",
      id: 42,
      poolCreditState: "depleted",
    });

    const blocked = await isUserBlocked("ws_test", "u_test");

    expect(blocked).toBe("credits_exhausted");
    expect(redisValues.get("metronome:user_credit_state:ws_test:u_test")).toBe(
      "on_pool"
    );
    expect(redisValues.get("metronome:pool_credit_status:ws_test")).toBe(
      "depleted"
    );
  });
});

describe("getFairUseAwuCreditsStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const workspace = {
    id: 42,
    sId: "ws_test",
  };

  const user = {
    id: 7,
    sId: "u_test",
  };

  function makePlan({
    maxAwuCredits,
    maxAwuCreditsTimeframe,
  }: {
    maxAwuCredits: number;
    maxAwuCreditsTimeframe: MaxAwuCreditsTimeframeType;
  }) {
    return renderPlanFromModel({
      plan: {
        ...FREE_NO_PLAN_DATA,
        maxAwuCredits,
        maxAwuCreditsTimeframe,
      },
    });
  }

  it("does not read Redis when the AWU fair-use limit is unlimited", async () => {
    const status = await getFairUseAwuCreditsStatus({
      workspace,
      user,
      plan: makePlan({ maxAwuCredits: -1, maxAwuCreditsTimeframe: "day" }),
    });

    expect(status).toEqual({
      limit: -1,
      timeframe: "day",
      count: 0,
    });
    expect(mockGetRateLimiterCount).not.toHaveBeenCalled();
  });

  it("reads the Redis-backed AWU fair-use usage for finite limits", async () => {
    mockGetRateLimiterCount.mockResolvedValue({
      isErr: () => false,
      isOk: () => true,
      value: 12,
    });

    const status = await getFairUseAwuCreditsStatus({
      workspace,
      user,
      plan: makePlan({ maxAwuCredits: 100, maxAwuCreditsTimeframe: "day" }),
    });

    expect(status).toEqual({
      limit: 100,
      timeframe: "day",
      count: 12,
    });
    expect(mockGetRateLimiterCount).toHaveBeenCalledWith({
      key: "workspace:42:user:7:fair_use_awu_credit_count:day",
      timeframeSeconds: 60 * 60 * 24,
    });
  });
});

describe("getWorkspaceCreditPoolStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisValues.clear();
  });

  it("returns cached status from Redis when present", async () => {
    redisValues.set(
      "metronome:pool_credit_status:ws_test",
      "active_low_balance"
    );

    const status = await getWorkspaceCreditPoolStatus("ws_test");

    expect(status).toBe("active_low_balance");
    expect(mockFetchWorkspaceById).not.toHaveBeenCalled();
  });

  it("falls back to DB on cache miss and populates Redis", async () => {
    mockFetchWorkspaceById.mockResolvedValue({
      sId: "ws_test",
      id: 42,
      poolCreditState: "depleted",
    });

    const status = await getWorkspaceCreditPoolStatus("ws_test");

    expect(status).toBe("depleted");
    expect(redisValues.get("metronome:pool_credit_status:ws_test")).toBe(
      "depleted"
    );
  });

  it("returns 'active' when workspace not found in DB fallback", async () => {
    mockFetchWorkspaceById.mockResolvedValue(null);

    const status = await getWorkspaceCreditPoolStatus("ws_test");

    expect(status).toBe("active");
  });

  it("falls back to DB when Redis has invalid value", async () => {
    redisValues.set("metronome:pool_credit_status:ws_test", "invalid_state");

    mockFetchWorkspaceById.mockResolvedValue({
      sId: "ws_test",
      id: 42,
      poolCreditState: "depleted",
    });

    const status = await getWorkspaceCreditPoolStatus("ws_test");

    expect(status).toBe("depleted");
    expect(mockFetchWorkspaceById).toHaveBeenCalled();
  });
});
