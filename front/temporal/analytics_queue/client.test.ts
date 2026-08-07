import { launchStoreAgentMessageConsumptionAttributionWorkflow } from "@app/temporal/analytics_queue/client";
import { QUEUE_NAME } from "@app/temporal/analytics_queue/config";
import { makeAgentMessageAnalyticsWorkflowId } from "@app/temporal/analytics_queue/helpers";
import { storeAgentMessageConsumptionAttributionV3Signal } from "@app/temporal/analytics_queue/signals";
import { storeAgentMessageConsumptionAttributionV3Workflow } from "@app/temporal/analytics_queue/workflows";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSignalWithStart } = vi.hoisted(() => ({
  mockSignalWithStart: vi.fn(),
}));

vi.mock("@app/lib/temporal", () => ({
  getTemporalClientForFrontNamespace: vi.fn(async () => ({
    workflow: {
      signalWithStart: mockSignalWithStart,
    },
  })),
}));

describe("launchStoreAgentMessageConsumptionAttributionWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignalWithStart.mockResolvedValue(undefined);
  });

  it("signals the replay-safe V3 workflow for every finalize", async () => {
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

    const first = await launchStoreAgentMessageConsumptionAttributionWorkflow({
      authType,
      agentLoopArgs,
    });
    const second = await launchStoreAgentMessageConsumptionAttributionWorkflow({
      authType,
      agentLoopArgs,
    });

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    expect(mockSignalWithStart).toHaveBeenCalledTimes(2);
    expect(mockSignalWithStart).toHaveBeenCalledWith(
      storeAgentMessageConsumptionAttributionV3Workflow,
      expect.objectContaining({
        args: [authType, { agentLoopArgs }],
        taskQueue: QUEUE_NAME,
        workflowId: `${makeAgentMessageAnalyticsWorkflowId({
          agentMessageId: agentLoopArgs.agentMessageId,
          conversationId: agentLoopArgs.conversationId,
          workspaceId: authType.workspaceId,
        })}-consumption-attribution-v3`,
        signal: storeAgentMessageConsumptionAttributionV3Signal,
        signalArgs: undefined,
      })
    );
  });
});
