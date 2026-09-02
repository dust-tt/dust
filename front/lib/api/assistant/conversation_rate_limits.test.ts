import { checkMessagesLimit } from "@app/lib/api/assistant/conversation";
import { getRedisStreamClient } from "@app/lib/api/redis";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import { statsDMetrics } from "@app/lib/utils/statsd";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/utils/statsd", () => ({
  statsDMetrics: {
    decrement: vi.fn(),
    distribution: vi.fn(),
    gauge: vi.fn(),
    histogram: vi.fn(),
    increment: vi.fn(),
    timing: vi.fn(),
  },
}));

describe("checkMessagesLimit", () => {
  it("records fair-use limit hits with the trigger message origin", async () => {
    const { authenticator, user, workspace } = await createResourceTest({});
    const { maxAwuCredits } =
      authenticator.getNonNullablePlan().limits.assistant;
    const redis = await getRedisStreamClient({ origin: "rate_limiter" });
    vi.mocked(redis.eval).mockImplementation(async (...args) => {
      const script = [args[0], args[1]].find(
        (arg): arg is string => typeof arg === "string"
      );
      if (!script) {
        throw new Error("Expected Redis eval script.");
      }
      return script.includes("oldest_timestamp_ms")
        ? [roundCreditsToMicroCredits(maxAwuCredits), -1]
        : 1;
    });

    const result = await checkMessagesLimit(authenticator, {
      mentions: [],
      context: {
        username: user.username,
        fullName: user.fullName(),
        email: user.email,
        profilePictureUrl: null,
        timezone: "UTC",
        origin: "triggered",
      },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.api_error.type).toBe("plan_message_limit_exceeded");
    }
    expect(statsDMetrics.increment).toHaveBeenCalledWith(
      "assistant.rate_limiter.fair_use_awu.limit_triggered",
      1,
      [`workspace_id:${workspace.sId}`, "message_origin:triggered"]
    );
  });
});
