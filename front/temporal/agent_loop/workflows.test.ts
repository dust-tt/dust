import type { AuthenticatorType } from "@app/lib/auth";
import {
  agentLoopWorkflow,
  runSandboxChildToolWorkflow,
} from "@app/temporal/agent_loop/workflows";
import type { AgentLoopArgsWithTiming } from "@app/types/assistant/agent_run";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  deprecatePatch,
  patched,
  checkCreditsActivity,
  finalizeErroredSandboxChildToolActivity,
  finalizeSuccessfulAgentLoopActivity,
  runToolActivity,
  runRetryableToolActivity,
  runToolActivityWithExplicitCancellation,
  runRetryableToolActivityWithExplicitCancellation,
  runModelAndCreateActionsActivity,
  runModelAndCreateActionsActivityWithExplicitCancellation,
  publishDeferredEventsActivity,
  workflowLogError,
} = vi.hoisted(() => ({
  deprecatePatch: vi.fn(),
  patched: vi.fn(),
  checkCreditsActivity: vi.fn(),
  finalizeErroredSandboxChildToolActivity: vi.fn(),
  finalizeSuccessfulAgentLoopActivity: vi.fn(),
  runToolActivity: vi.fn(),
  runRetryableToolActivity: vi.fn(),
  runToolActivityWithExplicitCancellation: vi.fn(),
  runRetryableToolActivityWithExplicitCancellation: vi.fn(),
  runModelAndCreateActionsActivity: vi.fn(),
  runModelAndCreateActionsActivityWithExplicitCancellation: vi.fn(),
  publishDeferredEventsActivity: vi.fn(),
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
    log: {
      error: workflowLogError,
    },
    patched,
    proxyActivities: (options: {
      cancellationType?: unknown;
      retry?: { maximumAttempts?: number };
    }) => ({
      checkCreditsActivity,
      compactionActivity: unusedActivity,
      compactionCleanupActivity: unusedActivity,
      ensureConversationTitleActivity: unusedActivity,
      finalizeCancelledAgentLoopActivity: unusedActivity,
      finalizeCreditStoppedAgentLoopActivity: unusedActivity,
      finalizeErroredAgentLoopActivity: unusedActivity,
      finalizeErroredSandboxChildToolActivity,
      finalizeGracefullyStoppedAgentLoopActivity: unusedActivity,
      finalizeInterruptedAgentLoopActivity: unusedActivity,
      finalizeSuccessfulAgentLoopActivity,
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
      searchAttributes: {},
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
  ] as const)("finalizes terminal activity failures without failing the workflow for %s", async (retryPolicy) => {
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
  });

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

describe("agentLoopWorkflow activity cancellation patches", () => {
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
    checkCreditsActivity.mockResolvedValue({ shouldStop: true });
    finalizeSuccessfulAgentLoopActivity.mockResolvedValue(undefined);
  });

  it("deprecates both patches and always uses explicit cancellation", async () => {
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
      "wait-for-model-activity-before-finalization"
    );
    expect(deprecatePatch).toHaveBeenCalledWith(
      "wait-for-all-tool-activities-before-finalization"
    );
  });
});
