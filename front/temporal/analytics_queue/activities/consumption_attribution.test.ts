import { indexAgentMessageConsumptionAnalytics } from "@app/lib/analytics/agent_message_consumption";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { storeAgentMessageConsumptionAnalyticsActivity } from "@app/temporal/analytics_queue/activities/consumption_attribution";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@app/lib/analytics/agent_message_consumption",
  async (importActual) => {
    const actual =
      await importActual<
        typeof import("@app/lib/analytics/agent_message_consumption")
      >();
    return { ...actual, indexAgentMessageConsumptionAnalytics: vi.fn() };
  }
);

const authType = {} as AuthenticatorType;
const agentLoopArgs = {
  agentMessageId: "agent_message_1",
} as AgentLoopArgs;

describe("storeAgentMessageConsumptionAnalyticsActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Authenticator, "fromJSON").mockResolvedValue({
      getNonNullableWorkspace: () => ({ sId: "workspace_1" }),
    } as Authenticator);
  });

  it("completes when indexing succeeds", async () => {
    vi.mocked(indexAgentMessageConsumptionAnalytics).mockResolvedValue(
      new Ok(undefined)
    );

    await expect(
      storeAgentMessageConsumptionAnalyticsActivity(authType, {
        agentLoopArgs,
      })
    ).resolves.toBeUndefined();
  });

  it("throws the Elasticsearch error so Temporal retries the activity", async () => {
    const error = new ElasticsearchError("query_error", "invalid mapping", 400);
    vi.mocked(indexAgentMessageConsumptionAnalytics).mockResolvedValue(
      new Err(error)
    );

    await expect(
      storeAgentMessageConsumptionAnalyticsActivity(authType, {
        agentLoopArgs,
      })
    ).rejects.toBe(error);
  });
});
