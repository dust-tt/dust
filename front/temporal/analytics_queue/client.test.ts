import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import {
  buildConsumptionExportCacheKey,
  buildConsumptionExportGcsPath,
} from "@app/temporal/analytics_queue/activities/consumption_export";
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
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSignalWithStart,
  mockStart,
  mockDescribe,
  mockQuery,
  mockGetHandle,
} = vi.hoisted(() => ({
  mockSignalWithStart: vi.fn(),
  mockStart: vi.fn(),
  mockDescribe: vi.fn(),
  mockQuery: vi.fn(),
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
    mockGetHandle.mockReturnValue({ describe: mockDescribe, query: mockQuery });
    // No cached export exists unless a test says otherwise.
    fileStorageMock.setFileExists(() => false);
  });

  it("starts the workflow when none is running for this export", async () => {
    const { authenticator } = await createResourceTest({});
    const workflowId = makeConsumptionExportWorkflowId({
      workspaceId: authenticator.getNonNullableWorkspace().sId,
      exportId: buildConsumptionExportCacheKey({
        period: periodA,
        filter: filterA,
      }),
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

  it("reuses a previously completed export for the same closed period and filter instead of recomputing it", async () => {
    const { authenticator } = await createResourceTest({});
    const workspaceId = authenticator.getNonNullableWorkspace().sId;
    const gcsPath = buildConsumptionExportGcsPath(
      workspaceId,
      buildConsumptionExportCacheKey({ period: periodA, filter: filterA })
    );
    fileStorageMock.setFileExists((filePath) => filePath === gcsPath);

    const result = await launchConsumptionExportWorkflow(authenticator, {
      period: periodA,
      filter: filterA,
    });

    expect(result.isOk() && result.value).toEqual({
      status: "cached",
      gcsPath,
    });
    // No need to even check for a running workflow: the cache hit is enough.
    expect(mockDescribe).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });

  describe("open-ended period (e.g. 'this cycle')", () => {
    // In the future relative to the mocked "now" below: this cycle's data keeps accruing
    // while the period value itself stays the same for its whole duration.
    const openEndedPeriod: ConsumptionPeriod = {
      startDate: "2026-08-01T00:00:00.000Z",
      endDate: "2027-01-01T00:00:00.000Z",
    };

    afterEach(() => {
      vi.useRealTimers();
    });

    it("reuses the same day's export instead of recrunching on a same-day retrigger", async () => {
      const { authenticator } = await createResourceTest({});
      const workspaceId = authenticator.getNonNullableWorkspace().sId;

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-14T09:00:00.000Z"));
      const gcsPath = buildConsumptionExportGcsPath(
        workspaceId,
        buildConsumptionExportCacheKey({
          period: {
            startDate: openEndedPeriod.startDate,
            endDate: "2026-08-14T23:59:59.999Z",
          },
          filter: filterA,
        })
      );
      fileStorageMock.setFileExists((filePath) => filePath === gcsPath);

      // A user retriggers "this cycle" again later the same day.
      vi.setSystemTime(new Date("2026-08-14T18:00:00.000Z"));
      const result = await launchConsumptionExportWorkflow(authenticator, {
        period: openEndedPeriod,
        filter: filterA,
      });

      expect(result.isOk() && result.value).toEqual({
        status: "cached",
        gcsPath,
      });
      expect(mockStart).not.toHaveBeenCalled();
    });

    it("does not reuse a previous day's export, so freshly accrued data is captured", async () => {
      const { authenticator } = await createResourceTest({});
      const workspaceId = authenticator.getNonNullableWorkspace().sId;
      const workflowId = makeConsumptionExportWorkflowId({
        workspaceId,
        exportId: buildConsumptionExportCacheKey({
          period: {
            startDate: openEndedPeriod.startDate,
            endDate: "2026-08-14T23:59:59.999Z",
          },
          filter: filterA,
        }),
      });

      // Yesterday's export exists in GCS...
      const yesterdaysGcsPath = buildConsumptionExportGcsPath(
        workspaceId,
        buildConsumptionExportCacheKey({
          period: {
            startDate: openEndedPeriod.startDate,
            endDate: "2026-08-13T23:59:59.999Z",
          },
          filter: filterA,
        })
      );
      fileStorageMock.setFileExists(
        (filePath) => filePath === yesterdaysGcsPath
      );
      mockDescribe.mockRejectedValue(
        new WorkflowNotFoundError("not found", workflowId, undefined)
      );
      mockStart.mockResolvedValue(undefined);

      // ...but the request comes in today, so it must not be served back.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-14T09:00:00.000Z"));
      const result = await launchConsumptionExportWorkflow(authenticator, {
        period: openEndedPeriod,
        filter: filterA,
      });

      expect(result.isOk() && result.value).toEqual({
        status: "started",
        workflowId,
      });
      expect(mockStart).toHaveBeenCalledTimes(1);
    });
  });

  it("starts its own workflow when a differently-scoped export is requested while another is running", async () => {
    const { authenticator } = await createResourceTest({});
    const workspaceId = authenticator.getNonNullableWorkspace().sId;
    const workflowIdB = makeConsumptionExportWorkflowId({
      workspaceId,
      exportId: buildConsumptionExportCacheKey({
        period: periodB,
        filter: filterB,
      }),
    });

    // Export A is already in flight for this workspace, under its own workflow ID.
    mockDescribe.mockRejectedValue(
      new WorkflowNotFoundError("not found", workflowIdB, undefined)
    );
    mockStart.mockResolvedValue(undefined);

    // Export B, with a different period/filter, gets its own workflow instead of
    // being blocked by A.
    const result = await launchConsumptionExportWorkflow(authenticator, {
      period: periodB,
      filter: filterB,
    });

    expect(result.isOk() && result.value).toEqual({
      status: "started",
      workflowId: workflowIdB,
    });
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it("reports already_running with the request's own parameters when the exact same export is already in flight", async () => {
    const { authenticator } = await createResourceTest({});
    const workflowId = makeConsumptionExportWorkflowId({
      workspaceId: authenticator.getNonNullableWorkspace().sId,
      exportId: buildConsumptionExportCacheKey({
        period: periodA,
        filter: filterA,
      }),
    });

    mockDescribe.mockResolvedValue({ status: { name: "RUNNING" } });

    const result = await launchConsumptionExportWorkflow(authenticator, {
      period: periodA,
      filter: filterA,
    });

    expect(result.isOk() && result.value).toEqual({
      status: "already_running",
      workflowId,
      period: periodA,
      filter: filterA,
    });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("reports already_running when the start call itself loses the race to a concurrent identical launch", async () => {
    const { authenticator } = await createResourceTest({});
    const workflowId = makeConsumptionExportWorkflowId({
      workspaceId: authenticator.getNonNullableWorkspace().sId,
      exportId: buildConsumptionExportCacheKey({
        period: periodA,
        filter: filterA,
      }),
    });

    // No export running yet at describe() time, but by the time start() is
    // called, a concurrent identical request has already won the race.
    mockDescribe.mockRejectedValue(
      new WorkflowNotFoundError("not found", workflowId, undefined)
    );
    mockStart.mockRejectedValue(
      new WorkflowExecutionAlreadyStartedError(
        "already started",
        workflowId,
        "runConsumptionExportWorkflow"
      )
    );

    const result = await launchConsumptionExportWorkflow(authenticator, {
      period: periodA,
      filter: filterA,
    });

    expect(result.isOk() && result.value).toEqual({
      status: "already_running",
      workflowId,
      period: periodA,
      filter: filterA,
    });
  });
});
