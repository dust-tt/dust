import { checkPremiumModelMessageLimit } from "@app/lib/api/assistant/premium_model_limit";
import type { Authenticator, AuthMethodType } from "@app/lib/auth";
import type { UserResource } from "@app/lib/resources/user_resource";
import type {
  UserMessageContext,
  UserMessageOrigin,
} from "@app/types/assistant/conversation";
import type { ResolvedRequestedModel } from "@app/types/assistant/models/types";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetFeatureFlags,
  mockGetRateLimiterCount,
  mockAddRateLimiterCount,
} = vi.hoisted(() => ({
  mockGetFeatureFlags: vi.fn(),
  mockGetRateLimiterCount: vi.fn(),
  mockAddRateLimiterCount: vi.fn(),
}));

vi.mock("@app/lib/auth", () => ({
  getFeatureFlags: mockGetFeatureFlags,
}));

vi.mock("@app/lib/utils/rate_limiter", () => ({
  getRateLimiterCount: mockGetRateLimiterCount,
  addRateLimiterCount: mockAddRateLimiterCount,
}));

const PREMIUM_MODEL: ResolvedRequestedModel = {
  providerId: "anthropic",
  modelId: "claude-opus-5",
  reasoningEffort: "medium",
};

const BALANCED_MODEL: ResolvedRequestedModel = {
  providerId: "anthropic",
  modelId: "claude-sonnet-5",
  reasoningEffort: "medium",
};

const EXPECTED_KEY = "workspace:42:user:7:premium_model_message_count";
const EXPECTED_WINDOW_SECONDS = 7 * 24 * 60 * 60;

// Minimal stand-in for the Authenticator class exposing only the members the gate reads. A class
// instance can't be constructed structurally, so a single `as unknown as` is the standard test-mock
// escape here (see the same pattern across the suite); the cast surface is kept to this one spot.
function makeAuth({
  planCode = "PRO_PLAN_SEAT_29",
  authMethod = "session",
}: {
  planCode?: string;
  authMethod?: AuthMethodType;
} = {}): Authenticator {
  return {
    getNonNullableWorkspace: () => ({ id: 42, sId: "ws_test" }),
    getNonNullablePlan: () => ({ code: planCode }),
    authMethod: () => authMethod,
  } as unknown as Authenticator;
}

const USER = {
  id: 7,
  sId: "user_test",
  toJSON: () => ({ id: 7, sId: "user_test" }),
} as unknown as UserResource;

function callGate(
  auth: Authenticator,
  {
    resolvedModel = PREMIUM_MODEL,
    origin = "web",
  }: {
    resolvedModel?: ResolvedRequestedModel;
    origin?: UserMessageOrigin;
  } = {}
) {
  return checkPremiumModelMessageLimit(auth, {
    user: USER,
    resolvedModel,
    context: { origin } as UserMessageContext,
  });
}

describe("checkPremiumModelMessageLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFeatureFlags.mockResolvedValue([
      "enforce_premium_model_message_limit",
    ]);
    mockGetRateLimiterCount.mockResolvedValue(new Ok(0));
    mockAddRateLimiterCount.mockResolvedValue(undefined);
  });

  it("records a premium message under the weekly limit", async () => {
    const result = await callGate(makeAuth());

    expect(result.isOk()).toBe(true);
    expect(mockGetRateLimiterCount).toHaveBeenCalledWith({
      key: EXPECTED_KEY,
      timeframeSeconds: EXPECTED_WINDOW_SECONDS,
    });
    expect(mockAddRateLimiterCount).toHaveBeenCalledWith(
      expect.objectContaining({
        key: EXPECTED_KEY,
        timeframeSeconds: EXPECTED_WINDOW_SECONDS,
        incrementBy: 1,
      })
    );
  });

  it("blocks and stops recording once the limit is reached and the flag is on", async () => {
    mockGetRateLimiterCount.mockResolvedValue(new Ok(25));

    const result = await callGate(makeAuth());

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.status_code).toBe(429);
      expect(result.error.api_error.type).toBe("rate_limit_error");
    }
    expect(mockAddRateLimiterCount).not.toHaveBeenCalled();
  });

  it("keeps recording past the limit when the flag is off", async () => {
    mockGetFeatureFlags.mockResolvedValue([]);
    mockGetRateLimiterCount.mockResolvedValue(new Ok(60));

    const result = await callGate(makeAuth());

    expect(result.isOk()).toBe(true);
    expect(mockAddRateLimiterCount).toHaveBeenCalledTimes(1);
  });

  it("allows and records when the count cannot be read", async () => {
    mockGetRateLimiterCount.mockResolvedValue(new Err(new Error("redis down")));

    const result = await callGate(makeAuth());

    expect(result.isOk()).toBe(true);
    expect(mockAddRateLimiterCount).toHaveBeenCalledTimes(1);
  });

  it("does not count non-premium models", async () => {
    const result = await callGate(makeAuth(), {
      resolvedModel: BALANCED_MODEL,
    });

    expect(result.isOk()).toBe(true);
    expect(mockGetRateLimiterCount).not.toHaveBeenCalled();
    expect(mockAddRateLimiterCount).not.toHaveBeenCalled();
  });

  it("does not count credit-priced plans", async () => {
    const result = await callGate(makeAuth({ planCode: "CP_PRO" }));

    expect(result.isOk()).toBe(true);
    expect(mockGetRateLimiterCount).not.toHaveBeenCalled();
    expect(mockAddRateLimiterCount).not.toHaveBeenCalled();
  });

  it("counts trigger and wakeup runs as fair use", async () => {
    for (const origin of ["triggered", "wakeup"] as const) {
      vi.clearAllMocks();
      mockGetRateLimiterCount.mockResolvedValue(new Ok(0));

      const result = await callGate(makeAuth({ authMethod: "internal" }), {
        origin,
      });

      expect(result.isOk()).toBe(true);
      expect(mockAddRateLimiterCount).toHaveBeenCalledTimes(1);
    }
  });

  it("does not count programmatic origins", async () => {
    for (const origin of ["api", "triggered_programmatic", "zapier"] as const) {
      vi.clearAllMocks();

      const result = await callGate(makeAuth({ authMethod: "internal" }), {
        origin,
      });

      expect(result.isOk()).toBe(true);
      expect(mockGetRateLimiterCount).not.toHaveBeenCalled();
      expect(mockAddRateLimiterCount).not.toHaveBeenCalled();
    }
  });

  it("does not count non-system API key auth", async () => {
    const result = await callGate(makeAuth({ authMethod: "api_key" }), {
      origin: "slack",
    });

    expect(result.isOk()).toBe(true);
    expect(mockGetRateLimiterCount).not.toHaveBeenCalled();
    expect(mockAddRateLimiterCount).not.toHaveBeenCalled();
  });

  it("counts system-key sub-agent runs that inherit an interactive origin", async () => {
    const result = await callGate(makeAuth({ authMethod: "system_api_key" }), {
      origin: "web",
    });

    expect(result.isOk()).toBe(true);
    expect(mockAddRateLimiterCount).toHaveBeenCalledTimes(1);
  });

  it("does not count free origins", async () => {
    const result = await callGate(makeAuth(), { origin: "agent_sidekick" });

    expect(result.isOk()).toBe(true);
    expect(mockGetRateLimiterCount).not.toHaveBeenCalled();
    expect(mockAddRateLimiterCount).not.toHaveBeenCalled();
  });
});
