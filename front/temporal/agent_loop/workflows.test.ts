import type { AuthenticatorType } from "@app/lib/auth";
import { runSandboxChildToolWorkflow } from "@app/temporal/agent_loop/workflows";
import type { AgentLoopArgsWithTiming } from "@app/types/assistant/agent_run";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  patched,
  runToolActivity,
  runRetryableToolActivity,
  publishDeferredEventsActivity,
} = vi.hoisted(() => ({
  patched: vi.fn(),
  runToolActivity: vi.fn(),
  runRetryableToolActivity: vi.fn(),
  publishDeferredEventsActivity: vi.fn(),
}));

vi.mock("@temporalio/workflow", () => {
  const unusedActivity = vi.fn();

  return {
    ActivityCancellationType: {
      WAIT_CANCELLATION_COMPLETED: "WAIT_CANCELLATION_COMPLETED",
    },
    CancellationScope: class {},
    defineSignal: (name: string) => name,
    patched,
    proxyActivities: (options: {
      cancellationType?: unknown;
      retry?: { maximumAttempts?: number };
    }) => ({
      checkCreditsActivity: unusedActivity,
      compactionActivity: unusedActivity,
      compactionCleanupActivity: unusedActivity,
      ensureConversationTitleActivity: unusedActivity,
      finalizeCancelledAgentLoopActivity: unusedActivity,
      finalizeCreditStoppedAgentLoopActivity: unusedActivity,
      finalizeErroredAgentLoopActivity: unusedActivity,
      finalizeGracefullyStoppedAgentLoopActivity: unusedActivity,
      finalizeInterruptedAgentLoopActivity: unusedActivity,
      finalizeSuccessfulAgentLoopActivity: unusedActivity,
      publishDeferredEventsActivity,
      runModelAndCreateActionsActivity: unusedActivity,
      runToolActivity:
        options.cancellationType === undefined &&
        options.retry?.maximumAttempts === 1
          ? runToolActivity
          : runRetryableToolActivity,
    }),
    proxySinks: () => ({
      metrics: {
        logAgentLoopDuration: vi.fn(),
        logAgentLoopError: vi.fn(),
        logPhaseCompletion: vi.fn(),
        logPhaseStart: vi.fn(),
        logStepCompletion: vi.fn(),
      },
    }),
    setHandler: vi.fn(),
    startChild: vi.fn(),
    workflowInfo: vi.fn(),
  };
});

const authType: AuthenticatorType = {
  authMethod: "internal",
  groupIds: [],
  isByok: false,
  role: "admin",
  subscriptionId: null,
  userId: null,
  workspaceId: "w123",
};

const agentLoopArgs: AgentLoopArgsWithTiming = {
  agentMessageId: "am123",
  agentMessageVersion: 0,
  conversationId: "c123",
  conversationTitle: null,
  initialStartTime: 0,
  userMessageId: "um123",
  userMessageOrigin: "web",
  userMessageVersion: 0,
};

describe("runSandboxChildToolWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    patched.mockReturnValue(true);
    runToolActivity.mockResolvedValue({ deferredEvents: [] });
    runRetryableToolActivity.mockResolvedValue({ deferredEvents: [] });
  });

  it.each([
    undefined,
    "no_retry",
  ] as const)("uses the single-attempt activity for retry policy %s", async (retryPolicy) => {
    await runSandboxChildToolWorkflow({
      actionModelId: 123,
      agentLoopArgs,
      authType,
      retryPolicy,
      step: 1,
    });

    expect(runToolActivity).toHaveBeenCalledOnce();
    expect(runRetryableToolActivity).not.toHaveBeenCalled();
  });

  it("uses the retryable activity only for retry_on_interrupt", async () => {
    await runSandboxChildToolWorkflow({
      actionModelId: 123,
      agentLoopArgs,
      authType,
      retryPolicy: "retry_on_interrupt",
      step: 1,
    });

    expect(runRetryableToolActivity).toHaveBeenCalledOnce();
    expect(runToolActivity).not.toHaveBeenCalled();
  });

  it("keeps the single-attempt activity when replaying without the patch marker", async () => {
    patched.mockReturnValue(false);

    await runSandboxChildToolWorkflow({
      actionModelId: 123,
      agentLoopArgs,
      authType,
      retryPolicy: "retry_on_interrupt",
      step: 1,
    });

    expect(runToolActivity).toHaveBeenCalledOnce();
    expect(runRetryableToolActivity).not.toHaveBeenCalled();
  });

  it("propagates terminal activity failures", async () => {
    const error = new Error("activity attempts exhausted");
    runRetryableToolActivity.mockRejectedValue(error);

    await expect(
      runSandboxChildToolWorkflow({
        actionModelId: 123,
        agentLoopArgs,
        authType,
        retryPolicy: "retry_on_interrupt",
        step: 1,
      })
    ).rejects.toBe(error);
  });
});
