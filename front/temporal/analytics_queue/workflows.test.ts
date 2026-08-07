import { storeAgentMessageConsumptionAttributionV3Workflow } from "@app/temporal/analytics_queue/workflows";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSetHandler,
  mockStoreConsumptionAnalytics,
  mockStoreConsumptionAttribution,
} = vi.hoisted(() => ({
  mockSetHandler: vi.fn(),
  mockStoreConsumptionAnalytics: vi.fn(),
  mockStoreConsumptionAttribution: vi.fn(),
}));

vi.mock("@temporalio/workflow", () => ({
  defineSignal: (name: string) => name,
  proxyActivities: () => ({
    storeAgentAnalyticsActivity: vi.fn(),
    storeAgentMessageFeedbackActivity: vi.fn(),
    storeAgentMessageConsumptionAttributionActivity:
      mockStoreConsumptionAttribution,
    storeAgentMessageConsumptionAnalyticsActivity:
      mockStoreConsumptionAnalytics,
  }),
  setHandler: mockSetHandler,
}));

describe("storeAgentMessageConsumptionAttributionV3Workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("indexes after attribution and repeats both activities when signalled", async () => {
    const { authenticator } = await createResourceTest({});
    const authType = authenticator.toJSON();
    const agentLoopArgs: AgentLoopArgs = {
      agentMessageId: "agent_message_test",
      agentMessageVersion: 0,
      conversationId: "conversation_test",
      conversationTitle: null,
      userMessageId: "user_message_test",
      userMessageVersion: 0,
      userMessageOrigin: "web",
    };
    const calls: string[] = [];
    let signalHandler: (() => void) | null = null;
    let attributionCalls = 0;

    mockSetHandler.mockImplementation(
      (_signal: unknown, handler: () => void) => {
        signalHandler = handler;
      }
    );
    mockStoreConsumptionAttribution.mockImplementation(async () => {
      calls.push("attribution");
      attributionCalls += 1;
      if (attributionCalls === 1) {
        const handler = signalHandler;
        if (!handler) {
          throw new Error("Workflow signal handler was not registered");
        }
        handler();
      }
    });
    mockStoreConsumptionAnalytics.mockImplementation(async () => {
      calls.push("analytics");
    });

    await storeAgentMessageConsumptionAttributionV3Workflow(authType, {
      agentLoopArgs,
    });

    expect(calls).toEqual([
      "attribution",
      "analytics",
      "attribution",
      "analytics",
    ]);
  });
});
