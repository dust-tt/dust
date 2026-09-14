import { applyPremiumModelFairUse } from "@app/lib/api/assistant/premium_model_limit";
import {
  PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK,
  PREMIUM_MODEL_MESSAGE_RATE_LIMIT_WINDOW_SECONDS,
} from "@app/lib/api/assistant/rate_limits";
import type { Authenticator, AuthMethodType } from "@app/lib/auth";
import type { UserResource } from "@app/lib/resources/user_resource";
import type {
  UserMessageContext,
  UserMessageOrigin,
} from "@app/types/assistant/conversation";
import type { ResolvedRequestedModel } from "@app/types/assistant/models/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetFeatureFlags, mockRateLimiter, mockGetEnabledModels } =
  vi.hoisted(() => ({
    mockGetFeatureFlags: vi.fn(),
    mockRateLimiter: vi.fn(),
    mockGetEnabledModels: vi.fn(),
  }));

vi.mock("@app/lib/auth", () => ({
  getFeatureFlags: mockGetFeatureFlags,
}));

vi.mock("@app/lib/utils/rate_limiter", () => ({
  rateLimiter: mockRateLimiter,
}));

vi.mock("@app/lib/model_tiers/enabled_models", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@app/lib/model_tiers/enabled_models")
  >()),
  getEnabledModelsForAuth: mockGetEnabledModels,
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
  return applyPremiumModelFairUse(auth, {
    user: USER,
    resolution: { resolvedModel, modelResolutionMethod: "user" },
    context: { origin } as UserMessageContext,
  });
}

function makeEnabledModels(
  models: {
    providerId: string;
    modelId: string;
    efforts: ("none" | "light" | "medium" | "high")[];
  }[]
) {
  return models.map(({ providerId, modelId, efforts }) => ({
    providerId,
    modelId,
    isSelectable: true,
    defaultReasoningEffort: efforts[0],
    supportedReasoningEfforts: {
      none: efforts.includes("none"),
      light: efforts.includes("light"),
      medium: efforts.includes("medium"),
      high: efforts.includes("high"),
    },
  }));
}

// First candidate of the Standard (`auto`) stream.
const AUTO_STREAM_HEAD = {
  providerId: "openai",
  modelId: "gpt-5.6-luna",
  efforts: ["high"] as const,
};

describe("applyPremiumModelFairUse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFeatureFlags.mockResolvedValue([
      "enforce_premium_model_message_limit",
    ]);
    mockRateLimiter.mockResolvedValue(1);
  });

  it("consumes one unit atomically for a premium message under the weekly limit", async () => {
    const result = await callGate(makeAuth());

    expect(result.action).toBe("run_as_requested");
    expect(mockRateLimiter).toHaveBeenCalledWith(
      expect.objectContaining({
        key: EXPECTED_KEY,
        maxPerTimeframe: PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK,
        timeframeSeconds: PREMIUM_MODEL_MESSAGE_RATE_LIMIT_WINDOW_SECONDS,
      })
    );
  });

  it("allows past the limit when the flag is off", async () => {
    mockGetFeatureFlags.mockResolvedValue([]);
    mockRateLimiter.mockResolvedValue(0);

    const result = await callGate(makeAuth());

    expect(result.action).toBe("run_as_requested");
    expect(mockGetEnabledModels).not.toHaveBeenCalled();
  });

  it("does not count non-premium models", async () => {
    const result = await callGate(makeAuth(), {
      resolvedModel: BALANCED_MODEL,
    });

    expect(result.action).toBe("run_as_requested");
    expect(mockRateLimiter).not.toHaveBeenCalled();
  });

  it("does not count credit-priced plans", async () => {
    const result = await callGate(makeAuth({ planCode: "CP_PRO" }));

    expect(result.action).toBe("run_as_requested");
    expect(mockRateLimiter).not.toHaveBeenCalled();
  });

  it("counts trigger and wakeup runs as fair use", async () => {
    for (const origin of ["triggered", "wakeup"] as const) {
      vi.clearAllMocks();
      mockRateLimiter.mockResolvedValue(1);

      const result = await callGate(makeAuth({ authMethod: "internal" }), {
        origin,
      });

      expect(result.action).toBe("run_as_requested");
      expect(mockRateLimiter).toHaveBeenCalledTimes(1);
    }
  });

  it("does not count programmatic origins", async () => {
    for (const origin of ["api", "triggered_programmatic", "zapier"] as const) {
      vi.clearAllMocks();

      const result = await callGate(makeAuth({ authMethod: "internal" }), {
        origin,
      });

      expect(result.action).toBe("run_as_requested");
      expect(mockRateLimiter).not.toHaveBeenCalled();
    }
  });

  it("does not count non-system API key auth", async () => {
    const result = await callGate(makeAuth({ authMethod: "api_key" }), {
      origin: "slack",
    });

    expect(result.action).toBe("run_as_requested");
    expect(mockRateLimiter).not.toHaveBeenCalled();
  });

  it("counts system-key sub-agent runs that inherit an interactive origin", async () => {
    const result = await callGate(makeAuth({ authMethod: "system_api_key" }), {
      origin: "web",
    });

    expect(result.action).toBe("run_as_requested");
    expect(mockRateLimiter).toHaveBeenCalledTimes(1);
  });

  it("does not count free origins", async () => {
    const result = await callGate(makeAuth(), { origin: "agent_sidekick" });

    expect(result.action).toBe("run_as_requested");
    expect(mockRateLimiter).not.toHaveBeenCalled();
  });
  it("downgrades to the Standard stream once the limit is reached and the flag is on", async () => {
    mockGetFeatureFlags.mockResolvedValue([
      "enforce_premium_model_message_limit",
    ]);
    mockRateLimiter.mockResolvedValue(0);
    mockGetEnabledModels.mockResolvedValue(
      makeEnabledModels([{ ...AUTO_STREAM_HEAD, efforts: ["high"] }])
    );

    const result = await callGate(makeAuth());

    expect(result.action).toBe("downgrade");
    if (result.action === "downgrade") {
      expect(result.requested).toEqual(PREMIUM_MODEL);
      expect(result.resolution.resolvedModel).toEqual({
        providerId: "openai",
        modelId: "gpt-5.6-luna",
        reasoningEffort: "high",
      });
      expect(result.resolution.modelResolutionMethod).toBe(
        "fair_use_downgrade"
      );
    }
  });

  it("refuses rather than downgrading when every stream candidate is premium", async () => {
    mockGetFeatureFlags.mockResolvedValue([
      "enforce_premium_model_message_limit",
    ]);
    mockRateLimiter.mockResolvedValue(0);
    // No stream candidate is available, so resolveStreamModel falls back to a preferred
    // large model, which is itself premium-tier.
    mockGetEnabledModels.mockResolvedValue(
      makeEnabledModels([
        {
          providerId: "anthropic",
          modelId: "claude-opus-5",
          efforts: ["high"],
        },
      ])
    );

    const result = await callGate(makeAuth());

    expect(result.action).toBe("refuse");
  });

  it("does not resolve a downgrade target while under the limit", async () => {
    mockGetFeatureFlags.mockResolvedValue([
      "enforce_premium_model_message_limit",
    ]);
    mockRateLimiter.mockResolvedValue(1);

    const result = await callGate(makeAuth());

    expect(result.action).toBe("run_as_requested");
    expect(mockGetEnabledModels).not.toHaveBeenCalled();
  });
});
