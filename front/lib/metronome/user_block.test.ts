import { isUserBlocked } from "@app/lib/metronome/user_block";
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

  it("returns from Redis when both cached flags are present", async () => {
    redisValues.set("metronome:user_cap:ws_test:u_test", "1");
    redisValues.set("metronome:pool_depleted:ws_test", "0");

    const blocked = await isUserBlocked("ws_test", "u_test");

    expect(blocked).toBe(true);
    expect(mockFetchWorkspaceById).not.toHaveBeenCalled();
    expect(mockFetchUserById).not.toHaveBeenCalled();
    expect(mockGetActiveMembershipOfUserInWorkspace).not.toHaveBeenCalled();
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

    expect(blocked).toBe(true);
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

    expect(blocked).toBe(true);
    expect(redisValues.get("metronome:user_cap:ws_test:u_test")).toBe("0");
    expect(redisValues.get("metronome:pool_depleted:ws_test")).toBe("1");
  });
});
