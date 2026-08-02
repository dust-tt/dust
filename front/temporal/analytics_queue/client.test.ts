import type { AuthenticatorType } from "@app/lib/auth";
import { launchStoreAgentMessageConsumptionAttributionWorkflow } from "@app/temporal/analytics_queue/client";
import { QUEUE_NAME } from "@app/temporal/analytics_queue/config";
import { makeAgentMessageAnalyticsWorkflowId } from "@app/temporal/analytics_queue/helpers";
import { storeAgentMessageConsumptionAttributionV2Signal } from "@app/temporal/analytics_queue/signals";
import { storeAgentMessageConsumptionAttributionV2Workflow } from "@app/temporal/analytics_queue/workflows";
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

  it("signals the replay-safe V2 workflow for every finalize", async () => {
    const authType = { workspaceId: "w_test" } as AuthenticatorType;
    const agentLoopArgs = {
      agentMessageId: "agent_message_test",
      conversationId: "conversation_test",
    } as AgentLoopArgs;

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
      storeAgentMessageConsumptionAttributionV2Workflow,
      expect.objectContaining({
        args: [authType, { agentLoopArgs }],
        taskQueue: QUEUE_NAME,
        workflowId: `${makeAgentMessageAnalyticsWorkflowId({
          agentMessageId: agentLoopArgs.agentMessageId,
          conversationId: agentLoopArgs.conversationId,
          workspaceId: authType.workspaceId,
        })}-consumption-attribution-v2`,
        signal: storeAgentMessageConsumptionAttributionV2Signal,
        signalArgs: undefined,
      })
    );
  });
});
