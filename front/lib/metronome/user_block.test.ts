import {
  getWorkspaceCreditPoolStatus,
  isUserBlocked,
} from "@app/lib/metronome/user_block";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("isUserBlocked", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisValues.clear();
  });

  it("returns 'user_cap_reached' from Redis when only the user-cap flag is set", async () => {
    redisValues.set("metronome:user_cap:ws_test:u_test", "1");
    redisValues.set("metronome:pool_depleted:ws_test", "0");

    const blocked = await isUserBlocked("ws_test", "u_test");

    expect(blocked).toBe("user_cap_reached");
    expect(mockFetchWorkspaceById).not.toHaveBeenCalled();
    expect(mockFetchUserById).not.toHaveBeenCalled();
    expect(mockGetActiveMembershipOfUserInWorkspace).not.toHaveBeenCalled();
  });

  it("returns 'credits_exhausted' when the pool is depleted, even if user is also capped", async () => {
    redisValues.set("metronome:user_cap:ws_test:u_test", "1");
    redisValues.set("metronome:pool_depleted:ws_test", "1");

    const blocked = await isUserBlocked("ws_test", "u_test");

    expect(blocked).toBe("credits_exhausted");
  });

  it("returns null when neither flag is set", async () => {
    redisValues.set("metronome:user_cap:ws_test:u_test", "0");
    redisValues.set("metronome:pool_depleted:ws_test", "0");

    const blocked = await isUserBlocked("ws_test", "u_test");

    expect(blocked).toBeNull();
  });

  it("falls back to DB on cold cache and repopulates both flags", async () => {
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
    expect(redisValues.get("metronome:user_cap:ws_test:u_test")).toBe("1");
    expect(redisValues.get("metronome:pool_depleted:ws_test")).toBe("0");
  });

  it("falls back to DB when one cache flag is missing and heals the missing flag", async () => {
    redisValues.set("metronome:user_cap:ws_test:u_test", "0");

    mockFetchWorkspaceById.mockResolvedValue({
      sId: "ws_test",
      id: 42,
      poolCreditState: "depleted",
    });
    mockFetchUserById.mockResolvedValue({ sId: "u_test", id: 7 });
    mockGetActiveMembershipOfUserInWorkspace.mockResolvedValue({
      creditState: "normal",
    });

    const blocked = await isUserBlocked("ws_test", "u_test");

    expect(blocked).toBe("credits_exhausted");
    expect(redisValues.get("metronome:user_cap:ws_test:u_test")).toBe("0");
    expect(redisValues.get("metronome:pool_depleted:ws_test")).toBe("1");
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
