import type { AuthenticatorType } from "@app/lib/auth";
import { consumptionWorkflow } from "@app/temporal/consumption/workflows";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyEvents: vi.fn(),
  billExecution: vi.fn(),
  cleanupEvents: vi.fn(),
  condition: vi.fn(),
  continueAsNew: vi.fn(),
  markEventsProcessed: vi.fn(),
  recoverPendingWorkflows: vi.fn(),
  reportActivityFailure: vi.fn(),
  setHandler: vi.fn(),
  sleep: vi.fn(),
}));

vi.mock("@temporalio/workflow", () => ({
  condition: mocks.condition,
  continueAsNew: mocks.continueAsNew,
  defineSignal: (name: string) => name,
  proxyActivities: () => ({
    applyConsumptionEventsActivity: mocks.applyEvents,
    billExecutionActivity: mocks.billExecution,
    cleanupConsumptionEventsActivity: mocks.cleanupEvents,
    markConsumptionEventsProcessedActivity: mocks.markEventsProcessed,
    recoverPendingConsumptionWorkflowsActivity: mocks.recoverPendingWorkflows,
    reportConsumptionActivityFailureActivity: mocks.reportActivityFailure,
  }),
  setHandler: mocks.setHandler,
  sleep: mocks.sleep,
}));

const authType: AuthenticatorType = {
  authMethod: "internal",
  groupIds: [],
  isByok: false,
  role: "admin",
  subscriptionId: null,
  userId: null,
  workspaceId: "workspace",
};

describe("consumptionWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.billExecution.mockResolvedValue(undefined);
    mocks.markEventsProcessed.mockResolvedValue(undefined);
    mocks.reportActivityFailure.mockResolvedValue(undefined);
  });

  it("drains and bills failed work immediately", async () => {
    mocks.applyEvents
      .mockResolvedValueOnce({
        eventModelIds: [1],
        esPending: false,
        finalizedExecution: {
          agentMessageModelId: 42,
          consumptionMode: "live",
          rootAgentMessageId: 101,
          status: "failed",
          timestamp: "2026-08-28T10:00:00.000Z",
        },
        hasMore: false,
      })
      .mockResolvedValueOnce({
        eventModelIds: [2],
        esPending: false,
        finalizedExecution: null,
        hasMore: false,
      });

    await consumptionWorkflow(authType, { runKey: "execution" });

    expect(mocks.applyEvents).toHaveBeenCalledTimes(2);
    expect(mocks.billExecution).toHaveBeenCalledWith(authType, {
      agentMessageModelId: 42,
      consumptionMode: "live",
      rootAgentMessageId: 101,
      runKey: "execution",
      status: "failed",
      timestamp: "2026-08-28T10:00:00.000Z",
    });
    expect(mocks.markEventsProcessed).toHaveBeenCalledTimes(2);
    expect(mocks.sleep).not.toHaveBeenCalled();
  });

  it("checks Postgres before waiting for another signal", async () => {
    mocks.applyEvents.mockResolvedValue({
      eventModelIds: [],
      esPending: false,
      finalizedExecution: null,
      hasMore: false,
    });
    mocks.condition.mockResolvedValue(false);

    await consumptionWorkflow(authType, { runKey: "execution" });

    expect(mocks.applyEvents).toHaveBeenCalledOnce();
    expect(mocks.condition).toHaveBeenCalledOnce();
    expect(mocks.applyEvents.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.condition.mock.invocationCallOrder[0]
    );
    expect(mocks.sleep).not.toHaveBeenCalled();
  });

  it("reports an activity after its retries are exhausted", async () => {
    mocks.applyEvents.mockRejectedValue(new Error("poison event"));

    await expect(
      consumptionWorkflow(authType, { runKey: "execution" })
    ).rejects.toThrow("poison event");
    expect(mocks.reportActivityFailure).toHaveBeenCalledWith(authType, {
      errorMessage: "poison event",
      operation: "apply_events",
      runKey: "execution",
    });
  });
});
