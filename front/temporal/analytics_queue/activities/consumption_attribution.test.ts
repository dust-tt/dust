import { indexAgentMessageConsumptionAnalytics } from "@app/lib/analytics/agent_message_consumption";
import { computeAndStoreAgentMessageConsumptionAttribution } from "@app/lib/api/assistant/agent_message_consumption_attribution/store";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import {
  storeAgentMessageConsumptionAnalyticsActivity,
  storeAgentMessageConsumptionAttributionForMessageActivity,
} from "@app/temporal/analytics_queue/activities/consumption_attribution";
import type { AgentMessageRef } from "@app/types/assistant/agent_run";
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

vi.mock(
  "@app/lib/api/assistant/agent_message_consumption_attribution/store",
  () => ({
    computeAndStoreAgentMessageConsumptionAttribution: vi.fn(),
  })
);

vi.mock("@app/lib/api/assistant/streaming/events", () => ({
  publishConversationRelatedEvent: vi.fn(),
}));

const authType = {} as AuthenticatorType;
const message: AgentMessageRef = {
  agentMessageId: "agent_message_1",
  conversationId: "conversation_1",
};

describe("storeAgentMessageConsumptionAttributionForMessageActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Authenticator, "fromJSON").mockResolvedValue({} as Authenticator);
  });

  it("publishes the settled credit cost after attribution is ready", async () => {
    vi.mocked(
      computeAndStoreAgentMessageConsumptionAttribution
    ).mockResolvedValue({ costCredits: 12 });

    await storeAgentMessageConsumptionAttributionForMessageActivity(authType, {
      message,
    });

    expect(publishConversationRelatedEvent).toHaveBeenCalledWith({
      conversationId: message.conversationId,
      event: {
        type: "agent_message_consumption_updated",
        created: expect.any(Number),
        conversationId: message.conversationId,
        messageId: message.agentMessageId,
        costCredits: 12,
      },
    });
  });

  it("does not publish while attribution is incomplete", async () => {
    vi.mocked(
      computeAndStoreAgentMessageConsumptionAttribution
    ).mockResolvedValue(undefined);

    await storeAgentMessageConsumptionAttributionForMessageActivity(authType, {
      message,
    });

    expect(publishConversationRelatedEvent).not.toHaveBeenCalled();
  });
});

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
        message,
      })
    ).resolves.toBeUndefined();

    expect(indexAgentMessageConsumptionAnalytics).toHaveBeenCalledWith(
      expect.anything(),
      {
        agentMessageId: message.agentMessageId,
      }
    );
  });

  it("throws the Elasticsearch error so Temporal retries the activity", async () => {
    const error = new ElasticsearchError("query_error", "invalid mapping", 400);
    vi.mocked(indexAgentMessageConsumptionAnalytics).mockResolvedValue(
      new Err(error)
    );

    await expect(
      storeAgentMessageConsumptionAnalyticsActivity(authType, {
        message,
      })
    ).rejects.toBe(error);
  });
});
