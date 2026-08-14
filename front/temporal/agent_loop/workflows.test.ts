import type { AuthenticatorType } from "@app/lib/auth";
import { runSandboxChildToolWorkflow } from "@app/temporal/agent_loop/workflows";
import type { AgentLoopArgsWithTiming } from "@app/types/assistant/agent_run";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  patched,
  finalizeErroredSandboxChildToolActivity,
  runToolActivity,
  runRetryableToolActivity,
  publishDeferredEventsActivity,
} = vi.hoisted(() => ({
  patched: vi.fn(),
  finalizeErroredSandboxChildToolActivity: vi.fn(),
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
    CancellationScope: class {
      static nonCancellable<T>(fn: () => Promise<T>) {
        return fn();
      }
    },
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
      finalizeErroredSandboxChildToolActivity,
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
    finalizeErroredSandboxChildToolActivity.mockResolvedValue(undefined);
  });

  it("defaults missing legacy input to no_retry without recording a patch marker", async () => {
    await runSandboxChildToolWorkflow({
      actionModelId: 123,
      agentLoopArgs,
      authType,
      step: 1,
    });

    expect(runToolActivity).toHaveBeenCalledOnce();
    expect(runRetryableToolActivity).not.toHaveBeenCalled();
    expect(patched).not.toHaveBeenCalled();
  });

  it("uses the single-attempt activity for no_retry", async () => {
    await runSandboxChildToolWorkflow({
      actionModelId: 123,
      agentLoopArgs,
      authType,
      retryPolicy: "no_retry",
      step: 1,
    });

    expect(runToolActivity).toHaveBeenCalledOnce();
    expect(runRetryableToolActivity).not.toHaveBeenCalled();
    expect(patched).toHaveBeenCalledWith("sandbox-child-tool-retry-policy");
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

  it.each([
    "no_retry",
    "retry_on_interrupt",
  ] as const)("finalizes and propagates terminal activity failures for %s", async (retryPolicy) => {
    const error = new Error("activity attempts exhausted");
    const runActivity =
      retryPolicy === "retry_on_interrupt"
        ? runRetryableToolActivity
        : runToolActivity;
    runActivity.mockRejectedValue(error);

    await expect(
      runSandboxChildToolWorkflow({
        actionModelId: 123,
        agentLoopArgs,
        authType,
        retryPolicy,
        step: 1,
      })
    ).rejects.toBe(error);

    expect(finalizeErroredSandboxChildToolActivity).toHaveBeenCalledWith(
      authType,
      { actionModelId: 123 }
    );
  });

  it("does not change failure bookkeeping when replaying without the patch marker", async () => {
    const error = new Error("activity failed");
    patched.mockReturnValue(false);
    runToolActivity.mockRejectedValue(error);

    await expect(
      runSandboxChildToolWorkflow({
        actionModelId: 123,
        agentLoopArgs,
        authType,
        retryPolicy: "retry_on_interrupt",
        step: 1,
      })
    ).rejects.toBe(error);

    expect(finalizeErroredSandboxChildToolActivity).not.toHaveBeenCalled();
  });
});
