import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import {
  launchConsumptionExportWorkflow,
  launchStoreAgentMessageConsumptionAttributionWorkflow,
} from "@app/temporal/analytics_queue/client";
import { QUEUE_NAME } from "@app/temporal/analytics_queue/config";
import {
  makeAgentMessageAnalyticsWorkflowId,
  makeConsumptionExportWorkflowId,
} from "@app/temporal/analytics_queue/helpers";
import { storeAgentMessageConsumptionAttributionV3Signal } from "@app/temporal/analytics_queue/signals";
import { storeAgentMessageConsumptionAttributionV3Workflow } from "@app/temporal/analytics_queue/workflows";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSignalWithStart, mockStart, mockDescribe, mockGetHandle } =
  vi.hoisted(() => ({
    mockSignalWithStart: vi.fn(),
    mockStart: vi.fn(),
    mockDescribe: vi.fn(),
    mockGetHandle: vi.fn(),
  }));

vi.mock("@app/lib/temporal", () => ({
  getTemporalClientForFrontNamespace: vi.fn(async () => ({
    workflow: {
      signalWithStart: mockSignalWithStart,
      start: mockStart,
      getHandle: mockGetHandle,
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
      message: agentLoopArgs,
    });
    const second = await launchStoreAgentMessageConsumptionAttributionWorkflow({
      authType,
      message: agentLoopArgs,
    });

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    expect(mockSignalWithStart).toHaveBeenCalledTimes(2);
    expect(mockSignalWithStart).toHaveBeenCalledWith(
      storeAgentMessageConsumptionAttributionV3Workflow,
      expect.objectContaining({
        args: [
          authType,
          {
            message: {
              agentMessageId: agentLoopArgs.agentMessageId,
              conversationId: agentLoopArgs.conversationId,
            },
          },
        ],
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

describe("launchConsumptionExportWorkflow", () => {
  const periodA: ConsumptionPeriod = {
    startDate: "2026-07-01T00:00:00.000Z",
    endDate: "2026-08-01T00:00:00.000Z",
  };
  const filterA: ConsumptionScopeFilter = { agents: ["agent_a"] };

  const periodB: ConsumptionPeriod = {
    startDate: "2026-06-01T00:00:00.000Z",
    endDate: "2026-07-01T00:00:00.000Z",
  };
  const filterB: ConsumptionScopeFilter = { agents: ["agent_b"] };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetHandle.mockReturnValue({ describe: mockDescribe });
  });

  it("starts the workflow when none is running for the workspace", async () => {
    const { authenticator } = await createResourceTest({});
    const workflowId = makeConsumptionExportWorkflowId({
      workspaceId: authenticator.getNonNullableWorkspace().sId,
    });

    mockDescribe.mockRejectedValue(
      new WorkflowNotFoundError("not found", workflowId, undefined)
    );
    mockStart.mockResolvedValue(undefined);

    const result = await launchConsumptionExportWorkflow(authenticator, {
      period: periodA,
      filter: filterA,
    });

    expect(result.isOk() && result.value).toEqual({
      status: "started",
      workflowId,
    });
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it("reports already_running with the running export's own parameters when a second, differently-scoped export is requested concurrently", async () => {
    const { authenticator } = await createResourceTest({});
    const workflowId = makeConsumptionExportWorkflowId({
      workspaceId: authenticator.getNonNullableWorkspace().sId,
    });

    // Export A is already in flight for this workspace.
    mockDescribe.mockResolvedValue({
      status: { name: "RUNNING" },
      memo: { period: periodA, filter: filterA },
    });

    // Export B, with a different period/filter, is requested while A runs.
    const result = await launchConsumptionExportWorkflow(authenticator, {
      period: periodB,
      filter: filterB,
    });

    expect(result.isOk() && result.value).toEqual({
      status: "already_running",
      workflowId,
      running: { period: periodA, filter: filterA },
    });
    // B's parameters must never be silently dropped by starting nothing and
    // reporting success as if B had been queued.
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("reports already_running when the start call itself loses the race to a concurrent launch", async () => {
    const { authenticator } = await createResourceTest({});
    const workflowId = makeConsumptionExportWorkflowId({
      workspaceId: authenticator.getNonNullableWorkspace().sId,
    });

    // No export running yet at describe() time...
    mockDescribe
      .mockRejectedValueOnce(
        new WorkflowNotFoundError("not found", workflowId, undefined)
      )
      // ...but by the time we look it up again after losing the start race,
      // export A (started by a concurrent request) is running.
      .mockResolvedValueOnce({
        status: { name: "RUNNING" },
        memo: { period: periodA, filter: filterA },
      });
    mockStart.mockRejectedValue(
      new WorkflowExecutionAlreadyStartedError(
        "already started",
        workflowId,
        "runConsumptionExportWorkflow"
      )
    );

    const result = await launchConsumptionExportWorkflow(authenticator, {
      period: periodB,
      filter: filterB,
    });

    expect(result.isOk() && result.value).toEqual({
      status: "already_running",
      workflowId,
      running: { period: periodA, filter: filterA },
    });
  });
});
