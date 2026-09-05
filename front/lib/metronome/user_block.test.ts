import {
  getWorkspaceCreditPoolStatus,
  isUserBlockedByMetronome,
} from "@app/lib/metronome/user_block";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

const workspace = { sId: "ws_test" } as LightWorkspaceType;
const user = { sId: "u_test" } as UserResource;

const {
  redisValues,
  mockFetchWorkspaceById,
  mockFetchUserById,
  mockGetActiveMembershipOfUserInWorkspace,
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

vi.mock("@app/logger/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("isUserBlockedByMetronome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // `clearAllMocks` resets call history but not implementations, so reset the
    // membership mock to its default (no membership) between tests.
    mockGetActiveMembershipOfUserInWorkspace.mockReset();
    redisValues.clear();
  });

  it("returns 'no_seat' when the user has no seat in the workspace", async () => {
    mockGetActiveMembershipOfUserInWorkspace.mockResolvedValue({
      seatType: "none",
    });

    const blocked = await isUserBlockedByMetronome(workspace, user, {
      userCapBlocked: false,
    });

    expect(blocked).toBe("no_seat");
    expect(mockRunOnRedis).not.toHaveBeenCalled();
  });

  it("userCapBlocked=true blocks even when the credit state is on_pool and pool is active", async () => {
    redisValues.set("metronome:user_credit_state:ws_test:u_test", "on_pool");
    redisValues.set("metronome:pool_credit_status:ws_test", "active");

    const blocked = await isUserBlockedByMetronome(workspace, user, {
      userCapBlocked: true,
    });

    expect(blocked).toBe("user_cap_reached");
  });

  it("userCapBlocked=true wins even when the pool is also depleted", async () => {
    redisValues.set("metronome:user_credit_state:ws_test:u_test", "on_pool");
    redisValues.set("metronome:pool_credit_status:ws_test", "depleted");

    const blocked = await isUserBlockedByMetronome(workspace, user, {
      userCapBlocked: true,
    });

    expect(blocked).toBe("user_cap_reached");
  });

  it("returns null when user is on_pool, pool is active and cap is not blocked", async () => {
    redisValues.set("metronome:user_credit_state:ws_test:u_test", "on_pool");
    redisValues.set("metronome:pool_credit_status:ws_test", "active");

    const blocked = await isUserBlockedByMetronome(workspace, user, {
      userCapBlocked: false,
    });

    expect(blocked).toBeNull();
  });

  it("does not block a 'user_seat' user when the pool is depleted", async () => {
    redisValues.set("metronome:user_credit_state:ws_test:u_test", "user_seat");
    redisValues.set("metronome:pool_credit_status:ws_test", "depleted");

    const blocked = await isUserBlockedByMetronome(workspace, user, {
      userCapBlocked: false,
    });

    expect(blocked).toBeNull();
  });

  it("blocks an 'on_pool' user when the pool is depleted", async () => {
    redisValues.set("metronome:user_credit_state:ws_test:u_test", "on_pool");
    redisValues.set("metronome:pool_credit_status:ws_test", "depleted");

    const blocked = await isUserBlockedByMetronome(workspace, user, {
      userCapBlocked: false,
    });

    expect(blocked).toBe("credits_exhausted");
  });

  it.each([
    "active_low_balance",
    "active_critical_balance",
    "overage",
  ] as const)("does not block when pool status is '%s' (non-depleted warning state)", async (poolState) => {
    redisValues.set("metronome:user_credit_state:ws_test:u_test", "on_pool");
    redisValues.set("metronome:pool_credit_status:ws_test", poolState);

    const blocked = await isUserBlockedByMetronome(workspace, user, {
      userCapBlocked: false,
    });

    expect(blocked).toBeNull();
  });

  it("falls back to DB when 'user_credit_state' Redis value is invalid", async () => {
    redisValues.set(
      "metronome:user_credit_state:ws_test:u_test",
      "not_a_valid_state"
    );
    redisValues.set("metronome:pool_credit_status:ws_test", "depleted");

    mockFetchUserById.mockResolvedValue({ sId: "u_test", id: 7 });
    mockFetchWorkspaceById.mockResolvedValue({
      sId: "ws_test",
      id: 42,
      poolCreditState: "depleted",
    });
    mockGetActiveMembershipOfUserInWorkspace.mockResolvedValue({
      creditState: "user_seat",
    });

    const blocked = await isUserBlockedByMetronome(workspace, user, {
      userCapBlocked: false,
    });

    // DB resolved the state to `user_seat`, so pool depletion does not block.
    expect(blocked).toBeNull();
    expect(mockFetchUserById).toHaveBeenCalled();
  });

  it("normalizes a legacy 'user_seat_low_balance' DB credit state to user_seat on fallback", async () => {
    // No cached user credit state → DB fallback; the legacy value normalizes to
    // `user_seat`, so the depleted pool does not block.
    redisValues.set("metronome:pool_credit_status:ws_test", "depleted");

    mockFetchUserById.mockResolvedValue({ sId: "u_test", id: 7 });
    mockFetchWorkspaceById.mockResolvedValue({
      sId: "ws_test",
      id: 42,
      poolCreditState: "depleted",
    });
    mockGetActiveMembershipOfUserInWorkspace.mockResolvedValue({
      creditState: "user_seat_low_balance",
    });

    const blocked = await isUserBlockedByMetronome(workspace, user, {
      userCapBlocked: false,
    });

    expect(blocked).toBeNull();
    expect(redisValues.get("metronome:user_credit_state:ws_test:u_test")).toBe(
      "user_seat"
    );
  });

  it("defaults to 'on_pool' and returns null when user is not found in DB fallback", async () => {
    mockFetchUserById.mockResolvedValue(null);
    mockFetchWorkspaceById.mockResolvedValue({
      sId: "ws_test",
      id: 42,
      poolCreditState: "active",
    });

    const blocked = await isUserBlockedByMetronome(workspace, user, {
      userCapBlocked: false,
    });

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

    const blocked = await isUserBlockedByMetronome(workspace, user, {
      userCapBlocked: false,
    });

    expect(blocked).toBeNull();
  });

  it("falls back to DB on cold cache and repopulates both keys", async () => {
    mockFetchWorkspaceById.mockResolvedValue({
      sId: "ws_test",
      id: 42,
      poolCreditState: "depleted",
    });
    mockFetchUserById.mockResolvedValue({ sId: "u_test", id: 7 });
    mockGetActiveMembershipOfUserInWorkspace.mockResolvedValue({
      creditState: "on_pool",
    });

    const blocked = await isUserBlockedByMetronome(workspace, user, {
      userCapBlocked: false,
    });

    expect(blocked).toBe("credits_exhausted");
    expect(redisValues.get("metronome:user_credit_state:ws_test:u_test")).toBe(
      "on_pool"
    );
    expect(redisValues.get("metronome:pool_credit_status:ws_test")).toBe(
      "depleted"
    );
  });

  it("falls back to DB when one cache key is missing and heals it", async () => {
    redisValues.set("metronome:user_credit_state:ws_test:u_test", "on_pool");

    mockFetchWorkspaceById.mockResolvedValue({
      sId: "ws_test",
      id: 42,
      poolCreditState: "depleted",
    });

    const blocked = await isUserBlockedByMetronome(workspace, user, {
      userCapBlocked: false,
    });

    expect(blocked).toBe("credits_exhausted");
    expect(redisValues.get("metronome:user_credit_state:ws_test:u_test")).toBe(
      "on_pool"
    );
    expect(redisValues.get("metronome:pool_credit_status:ws_test")).toBe(
      "depleted"
    );
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
