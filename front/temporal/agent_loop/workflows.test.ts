import type { AuthenticatorType } from "@app/lib/auth";
import {
  agentLoopWorkflow,
  runSandboxChildToolWorkflow,
} from "@app/temporal/agent_loop/workflows";
import type { AgentLoopArgsWithTiming } from "@app/types/assistant/agent_run";
import {
  ActivityFailure,
  RetryState,
  TimeoutFailure,
  TimeoutType,
} from "@temporalio/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  deprecatePatch,
  patched,
  checkCreditsActivity,
  claimToolActivityNeverStartedActivity,
  finalizeCreditSpendCheckpointPausedAgentLoopActivity,
  finalizeErroredSandboxChildToolActivity,
  finalizeSuccessfulAgentLoopActivity,
  runToolActivity,
  runRetryableToolActivity,
  runToolActivityWithExplicitCancellation,
  runRetryableToolActivityWithExplicitCancellation,
  runModelAndCreateActionsActivity,
  runModelAndCreateActionsActivityWithExplicitCancellation,
  publishDeferredEventsActivity,
  upsertOngoingAgentLoopActivity,
  deleteOngoingAgentLoopActivity,
  workflowLogError,
} = vi.hoisted(() => ({
  deprecatePatch: vi.fn(),
  patched: vi.fn(),
  checkCreditsActivity: vi.fn(),
  claimToolActivityNeverStartedActivity: vi.fn(),
  finalizeCreditSpendCheckpointPausedAgentLoopActivity: vi.fn(),
  finalizeErroredSandboxChildToolActivity: vi.fn(),
  finalizeSuccessfulAgentLoopActivity: vi.fn(),
  runToolActivity: vi.fn(),
  runRetryableToolActivity: vi.fn(),
  runToolActivityWithExplicitCancellation: vi.fn(),
  runRetryableToolActivityWithExplicitCancellation: vi.fn(),
  runModelAndCreateActionsActivity: vi.fn(),
  runModelAndCreateActionsActivityWithExplicitCancellation: vi.fn(),
  publishDeferredEventsActivity: vi.fn(),
  upsertOngoingAgentLoopActivity: vi.fn(),
  deleteOngoingAgentLoopActivity: vi.fn(),
  workflowLogError: vi.fn(),
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

      run<T>(fn: () => Promise<T>) {
        return fn();
      }

      cancel() {}
    },
    defineSignal: (name: string) => name,
    deprecatePatch,
    isCancellation: () => false,
    log: {
      error: workflowLogError,
      warn: vi.fn(),
    },
    patched,
    proxyActivities: (options: {
      cancellationType?: unknown;
      retry?: { maximumAttempts?: number };
    }) => ({
      checkCreditsActivity,
      claimToolActivityNeverStartedActivity,
      compactionActivity: unusedActivity,
      compactionCleanupActivity: unusedActivity,
      ensureConversationTitleActivity: unusedActivity,
      finalizeCancelledAgentLoopActivity: unusedActivity,
      finalizeCreditSpendCheckpointPausedAgentLoopActivity,
      finalizeCreditStoppedAgentLoopActivity: unusedActivity,
      finalizeErroredAgentLoopActivity: unusedActivity,
      finalizeErroredSandboxChildToolActivity,
      finalizeGracefullyStoppedAgentLoopActivity: unusedActivity,
      finalizeInterruptedAgentLoopActivity: unusedActivity,
      finalizeSuccessfulAgentLoopActivity,
      upsertOngoingAgentLoopActivity,
      deleteOngoingAgentLoopActivity,
      publishDeferredEventsActivity,
      runModelAndCreateActionsActivity:
        options.cancellationType === undefined
          ? runModelAndCreateActionsActivity
          : runModelAndCreateActionsActivityWithExplicitCancellation,
      runToolActivity:
        options.cancellationType === undefined
          ? options.retry?.maximumAttempts === 1
            ? runToolActivity
            : runRetryableToolActivity
          : options.retry?.maximumAttempts === 1
            ? runToolActivityWithExplicitCancellation
            : runRetryableToolActivityWithExplicitCancellation,
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
    workflowInfo: vi.fn(() => ({
      memo: {},
      runId: "run-id",
      searchAttributes: {},
      workflowId: "workflow-id",
    })),
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

function makeToolHeartbeatTimeout() {
  return new ActivityFailure(
    "Activity task timed out",
    "runToolActivity",
    "3",
    RetryState.MAXIMUM_ATTEMPTS_REACHED,
    "worker-id",
    new TimeoutFailure(
      "activity Heartbeat timeout",
      undefined,
      TimeoutType.HEARTBEAT
    )
  );
}

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

  it.each(["no_retry", "retry_on_interrupt"] as const)(
    "finalizes terminal activity failures without failing the workflow for %s",
    async (retryPolicy) => {
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
      ).resolves.toBeUndefined();

      expect(finalizeErroredSandboxChildToolActivity).toHaveBeenCalledWith(
        authType,
        { actionModelId: 123 }
      );
      expect(workflowLogError).toHaveBeenCalledWith(
        "Sandbox child tool activity failed.",
        {
          actionModelId: 123,
          error,
        }
      );
    }
  );

  it("preserves terminal activity failure propagation when replaying without the completion patch", async () => {
    const error = new Error("activity attempts exhausted");
    runToolActivity.mockRejectedValue(error);
    patched.mockImplementation(
      (patchId) => patchId === "sandbox-child-tool-retry-policy"
    );

    await expect(
      runSandboxChildToolWorkflow({
        actionModelId: 123,
        agentLoopArgs,
        authType,
        retryPolicy: "no_retry",
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

describe("never started tool activity rescheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    patched.mockReturnValue(true);
    claimToolActivityNeverStartedActivity.mockResolvedValue(true);
    finalizeErroredSandboxChildToolActivity.mockResolvedValue(undefined);
  });

  it("reschedules a no_retry tool activity that never started", async () => {
    runToolActivity
      .mockRejectedValueOnce(makeToolHeartbeatTimeout())
      .mockResolvedValueOnce({ deferredEvents: [] });

    await runSandboxChildToolWorkflow({
      actionModelId: 123,
      agentLoopArgs,
      authType,
      retryPolicy: "no_retry",
      step: 1,
    });

    expect(runToolActivity).toHaveBeenCalledTimes(2);
    expect(patched).toHaveBeenCalledWith("retry-never-started-tool-activity");
    expect(claimToolActivityNeverStartedActivity).toHaveBeenCalledWith({
      workflowId: "workflow-id",
      runId: "run-id",
      activityId: "3",
    });
    expect(finalizeErroredSandboxChildToolActivity).not.toHaveBeenCalled();
  });

  it("reschedules at most once", async () => {
    runToolActivity.mockRejectedValue(makeToolHeartbeatTimeout());

    await runSandboxChildToolWorkflow({
      actionModelId: 123,
      agentLoopArgs,
      authType,
      retryPolicy: "no_retry",
      step: 1,
    });

    expect(runToolActivity).toHaveBeenCalledTimes(2);
    expect(finalizeErroredSandboxChildToolActivity).toHaveBeenCalledOnce();
  });

  it("does not reschedule a tool activity that claimed its start", async () => {
    claimToolActivityNeverStartedActivity.mockResolvedValue(false);
    runToolActivity.mockRejectedValue(makeToolHeartbeatTimeout());

    await runSandboxChildToolWorkflow({
      actionModelId: 123,
      agentLoopArgs,
      authType,
      retryPolicy: "no_retry",
      step: 1,
    });

    expect(runToolActivity).toHaveBeenCalledOnce();
    expect(finalizeErroredSandboxChildToolActivity).toHaveBeenCalledOnce();
  });

  it("rethrows the tool heartbeat timeout when the claim fails", async () => {
    const heartbeatTimeout = makeToolHeartbeatTimeout();
    claimToolActivityNeverStartedActivity.mockRejectedValue(
      new Error("redis down")
    );
    runToolActivity.mockRejectedValue(heartbeatTimeout);

    await runSandboxChildToolWorkflow({
      actionModelId: 123,
      agentLoopArgs,
      authType,
      retryPolicy: "no_retry",
      step: 1,
    });

    expect(runToolActivity).toHaveBeenCalledOnce();
    expect(workflowLogError).toHaveBeenCalledWith(
      "Sandbox child tool activity failed.",
      { actionModelId: 123, error: heartbeatTimeout }
    );
  });

  it("does not reschedule when replaying without the patch marker", async () => {
    patched.mockImplementation(
      (patchId) => patchId !== "retry-never-started-tool-activity"
    );
    runToolActivity.mockRejectedValue(makeToolHeartbeatTimeout());

    await runSandboxChildToolWorkflow({
      actionModelId: 123,
      agentLoopArgs,
      authType,
      retryPolicy: "no_retry",
      step: 1,
    });

    expect(runToolActivity).toHaveBeenCalledOnce();
    expect(claimToolActivityNeverStartedActivity).not.toHaveBeenCalled();
    expect(finalizeErroredSandboxChildToolActivity).toHaveBeenCalledOnce();
  });

  it("does not claim for failures other than tool heartbeat timeouts", async () => {
    runToolActivity.mockRejectedValue(new Error("activity failed"));

    await runSandboxChildToolWorkflow({
      actionModelId: 123,
      agentLoopArgs,
      authType,
      retryPolicy: "no_retry",
      step: 1,
    });

    expect(runToolActivity).toHaveBeenCalledOnce();
    expect(claimToolActivityNeverStartedActivity).not.toHaveBeenCalled();
    expect(patched).not.toHaveBeenCalledWith(
      "retry-never-started-tool-activity"
    );
  });

  it("reschedules a no_retry tool activity of the agent loop that never started", async () => {
    runModelAndCreateActionsActivityWithExplicitCancellation.mockResolvedValue({
      actionBlobs: [
        {
          actionId: "action-1",
          needsApproval: false,
          retryPolicy: "no_retry",
        },
      ],
      runId: "run-1",
    });
    runToolActivityWithExplicitCancellation
      .mockRejectedValueOnce(makeToolHeartbeatTimeout())
      .mockResolvedValueOnce({ deferredEvents: [] });
    checkCreditsActivity.mockResolvedValue({
      shouldStop: true,
      reason: "credits_exhausted",
    });
    finalizeSuccessfulAgentLoopActivity.mockResolvedValue(undefined);

    await agentLoopWorkflow({
      agentLoopArgs: { ...agentLoopArgs, conversationTitle: "Existing" },
      authType,
      initialStartTime: 0,
      startStep: 0,
    });

    expect(runToolActivityWithExplicitCancellation).toHaveBeenCalledTimes(2);
    expect(
      runRetryableToolActivityWithExplicitCancellation
    ).not.toHaveBeenCalled();
  });
});

describe("agentLoopWorkflow activity cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runModelAndCreateActionsActivityWithExplicitCancellation.mockResolvedValue({
      actionBlobs: [
        {
          actionId: "action-1",
          needsApproval: false,
          retryPolicy: "no_retry",
        },
      ],
      runId: "run-1",
    });
    runToolActivityWithExplicitCancellation.mockResolvedValue({
      deferredEvents: [],
    });
    checkCreditsActivity.mockResolvedValue({
      shouldStop: true,
      reason: "credits_exhausted",
    });
    finalizeSuccessfulAgentLoopActivity.mockResolvedValue(undefined);
  });

  it("always uses explicit cancellation for model and tool activities", async () => {
    await agentLoopWorkflow({
      agentLoopArgs: { ...agentLoopArgs, conversationTitle: "Existing" },
      authType,
      initialStartTime: 0,
      startStep: 0,
    });

    expect(
      runModelAndCreateActionsActivityWithExplicitCancellation
    ).toHaveBeenCalledOnce();
    expect(runModelAndCreateActionsActivity).not.toHaveBeenCalled();
    expect(runToolActivityWithExplicitCancellation).toHaveBeenCalledOnce();
    expect(runToolActivity).not.toHaveBeenCalled();
    expect(deprecatePatch).toHaveBeenCalledWith(
      "wait-for-all-tool-activities-before-finalization"
    );
  });

  it("registers and removes user-launched loops", async () => {
    patched.mockReturnValue(true);
    const userAuthType = { ...authType, userId: "u123" };

    await agentLoopWorkflow({
      agentLoopArgs: { ...agentLoopArgs, conversationTitle: "Existing" },
      authType: userAuthType,
      initialStartTime: 0,
      startStep: 0,
    });

    const entry = {
      workspaceId: "w123",
      userId: "u123",
      conversationId: "c123",
      messageId: "am123",
    };
    expect(upsertOngoingAgentLoopActivity).toHaveBeenCalledWith(entry);
    expect(deleteOngoingAgentLoopActivity).toHaveBeenCalledWith(entry);
  });

  it("does not change registry state when replaying pre-registry workflows", async () => {
    patched.mockReturnValue(false);

    await agentLoopWorkflow({
      agentLoopArgs: { ...agentLoopArgs, conversationTitle: "Existing" },
      authType: { ...authType, userId: "u123" },
      initialStartTime: 0,
      startStep: 0,
    });

    expect(patched).toHaveBeenCalledWith("track-user-agent-loops-in-redis");
    expect(upsertOngoingAgentLoopActivity).not.toHaveBeenCalled();
    expect(deleteOngoingAgentLoopActivity).not.toHaveBeenCalled();
  });

  it("removes user-launched loops when execution fails", async () => {
    patched.mockReturnValue(true);
    const error = new Error("model failed");
    runModelAndCreateActionsActivityWithExplicitCancellation.mockRejectedValue(
      error
    );

    await expect(
      agentLoopWorkflow({
        agentLoopArgs: { ...agentLoopArgs, conversationTitle: "Existing" },
        authType: { ...authType, userId: "u123" },
        initialStartTime: 0,
        startStep: 0,
      })
    ).rejects.toBe(error);

    expect(deleteOngoingAgentLoopActivity).toHaveBeenCalledWith({
      workspaceId: "w123",
      userId: "u123",
      conversationId: "c123",
      messageId: "am123",
    });
  });
});

describe("agentLoopWorkflow credit spend checkpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    patched.mockReturnValue(true);
    runModelAndCreateActionsActivityWithExplicitCancellation.mockResolvedValue({
      actionBlobs: [
        {
          actionId: "action-1",
          needsApproval: false,
          retryPolicy: "no_retry",
        },
      ],
      runId: "run-1",
      creditSpendCheckpointCrossed: false,
    });
    runToolActivityWithExplicitCancellation.mockResolvedValue({
      deferredEvents: [],
    });
    checkCreditsActivity.mockResolvedValue({ shouldStop: false, reason: null });
    finalizeSuccessfulAgentLoopActivity.mockResolvedValue(undefined);
    finalizeCreditSpendCheckpointPausedAgentLoopActivity.mockResolvedValue(
      undefined
    );
  });

  it("continues the loop when the step result says the checkpoint isn't crossed", async () => {
    checkCreditsActivity
      .mockResolvedValueOnce({ shouldStop: false, reason: null })
      .mockResolvedValue({ shouldStop: true, reason: "credits_exhausted" });

    await agentLoopWorkflow({
      agentLoopArgs: { ...agentLoopArgs, conversationTitle: "Existing" },
      authType,
      initialStartTime: 0,
      startStep: 0,
    });

    expect(
      runModelAndCreateActionsActivityWithExplicitCancellation
    ).toHaveBeenCalledTimes(2);
    expect(
      finalizeCreditSpendCheckpointPausedAgentLoopActivity
    ).not.toHaveBeenCalled();
  });

  it("breaks out of the loop and finalizes as paused when the checkpoint is crossed", async () => {
    runModelAndCreateActionsActivityWithExplicitCancellation.mockResolvedValue({
      actionBlobs: [
        {
          actionId: "action-1",
          needsApproval: false,
          retryPolicy: "no_retry",
        },
      ],
      runId: "run-1",
      creditSpendCheckpointCrossed: true,
    });

    await agentLoopWorkflow({
      agentLoopArgs: { ...agentLoopArgs, conversationTitle: "Existing" },
      authType,
      initialStartTime: 0,
      startStep: 0,
    });

    expect(
      runModelAndCreateActionsActivityWithExplicitCancellation
    ).toHaveBeenCalledOnce();
    expect(
      finalizeCreditSpendCheckpointPausedAgentLoopActivity
    ).toHaveBeenCalledWith(
      authType,
      expect.objectContaining({ agentMessageId: "am123" })
    );
    expect(finalizeSuccessfulAgentLoopActivity).not.toHaveBeenCalled();
  });
});
