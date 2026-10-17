import { indexAgentMessageConsumptionAnalytics } from "@app/lib/analytics/agent_message_consumption";
import { computeAndStoreAgentMessageConsumptionAttribution } from "@app/lib/api/assistant/agent_message_consumption_attribution/store";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { AuthenticatorType } from "@app/lib/auth";
import {
  storeAgentMessageConsumptionAnalyticsActivity,
  storeAgentMessageConsumptionAttributionForMessageActivity,
} from "@app/temporal/analytics_queue/activities/consumption_attribution";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
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

let authType: AuthenticatorType;
const message: AgentMessageRef = {
  agentMessageId: "agent_message_1",
  conversationId: "conversation_1",
};

describe("storeAgentMessageConsumptionAttributionForMessageActivity", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { authenticator } = await createResourceTest({});
    authType = authenticator.toJSON();
  });

  it("publishes the settled credit cost after attribution is ready", async () => {
    vi.mocked(
      computeAndStoreAgentMessageConsumptionAttribution
    ).mockResolvedValue(new Ok({ costCredits: 12 }));

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

  it("does not publish when the message has no attribution to store", async () => {
    vi.mocked(
      computeAndStoreAgentMessageConsumptionAttribution
    ).mockResolvedValue(new Ok(undefined));

    await storeAgentMessageConsumptionAttributionForMessageActivity(authType, {
      message,
    });

    expect(publishConversationRelatedEvent).not.toHaveBeenCalled();
  });

  it("throws an Error naming the skip reason when attribution does not reconcile", async () => {
    vi.mocked(
      computeAndStoreAgentMessageConsumptionAttribution
    ).mockResolvedValue(
      new Err({
        code: "incomplete_attribution",
        context: { attributionVersion: 10, completeModel: false },
      })
    );

    await expect(
      storeAgentMessageConsumptionAttributionForMessageActivity(authType, {
        message,
      })
    ).rejects.toThrow(
      new Error(
        '[ConsumptionAttribution] Reconciliation failed: incomplete_attribution {"attributionVersion":10,"completeModel":false}'
      )
    );
    expect(publishConversationRelatedEvent).not.toHaveBeenCalled();
  });
});

describe("storeAgentMessageConsumptionAnalyticsActivity", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { authenticator } = await createResourceTest({});
    authType = authenticator.toJSON();
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

  it("throws an Error naming the skip reason when the documents do not add up", async () => {
    vi.mocked(indexAgentMessageConsumptionAnalytics).mockResolvedValue(
      new Err({
        code: "credit_mismatch",
        context: {
          attributionVersion: 10,
          indexedCreditMicro: 4_000_000,
          reconciledCreditMicro: 5_000_000,
          documentCount: 2,
        },
      })
    );

    await expect(
      storeAgentMessageConsumptionAnalyticsActivity(authType, {
        message,
      })
    ).rejects.toThrow(
      new Error(
        '[ConsumptionAnalytics] Consumption documents skipped: credit_mismatch {"attributionVersion":10,"indexedCreditMicro":4000000,"reconciledCreditMicro":5000000,"documentCount":2}'
      )
    );
  });
});
