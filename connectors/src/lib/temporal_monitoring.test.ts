import { Context, type Info } from "@temporalio/activity";
import {
  noopMetricMeter,
  type Logger as TemporalLogger,
} from "@temporalio/common";
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  fetchById: vi.fn(),
  getConnectorId: vi.fn(),
  getConnectorManager: vi.fn(),
  info: vi.fn(),
  pauseAndStop: vi.fn(),
  statsDIncrement: vi.fn(),
  syncFailed: vi.fn(),
  trace: vi.fn(),
}));

vi.mock("@connectors/connectors", () => ({
  getConnectorManager: mocks.getConnectorManager,
}));

vi.mock("@connectors/lib/sync_status", () => ({
  syncFailed: mocks.syncFailed,
}));

vi.mock("@connectors/lib/temporal", () => ({
  getConnectorId: mocks.getConnectorId,
}));

vi.mock("@connectors/logger/logger", () => ({
  default: {
    child: vi.fn(() => ({
      error: mocks.error,
      info: mocks.info,
    })),
  },
}));

vi.mock("@connectors/logger/withlogging", () => ({
  statsDClient: {
    increment: mocks.statsDIncrement,
  },
}));

vi.mock("@connectors/resources/connector_resource", () => ({
  ConnectorResource: {
    fetchById: mocks.fetchById,
  },
}));

vi.mock("dd-trace", () => ({
  default: {
    trace: mocks.trace,
  },
}));

import logger from "@connectors/logger/logger";

import {
  RemoteDatabaseConnectionNotReadonlyError,
  ThirdPartyConfigurationError,
} from "./error";
import { ActivityInboundLogInterceptor } from "./temporal_monitoring";

const temporalLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  log: vi.fn(),
  trace: vi.fn(),
  warn: vi.fn(),
} satisfies TemporalLogger;

function makeActivityContext() {
  const info = {
    activityId: "activity-id",
    activityNamespace: "default",
    activityType: "checkPermissions",
    attempt: 1,
    base64TaskToken: "",
    currentAttemptScheduledTimestampMs: 0,
    heartbeatDetails: undefined,
    isLocal: false,
    scheduledTimestampMs: 0,
    scheduleToCloseTimeoutMs: 60_000,
    startToCloseTimeoutMs: 60_000,
    taskQueue: "task-queue",
    taskToken: new Uint8Array(),
    workflowExecution: {
      runId: "run-id",
      workflowId: "workflow-id",
    },
    workflowNamespace: "default",
    workflowType: "snowflakeSyncWorkflow",
  } satisfies Info;

  return new Context(
    info,
    new Promise<never>(() => undefined),
    new AbortController().signal,
    () => undefined,
    undefined,
    temporalLogger,
    noopMetricMeter,
    {}
  );
}

describe("ActivityInboundLogInterceptor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchById.mockResolvedValue({
      dataSourceId: "data-source-id",
      id: 42,
      type: "snowflake",
      workspaceId: "workspace-id",
    });
    mocks.getConnectorId.mockResolvedValue(42);
    mocks.getConnectorManager.mockReturnValue({
      pauseAndStop: mocks.pauseAndStop,
    });
    mocks.trace.mockImplementation((_name, _options, next) =>
      next({
        setTag: vi.fn(),
      })
    );
  });

  it("marks Snowflake read-only failures and pauses the connector", async () => {
    const interceptor = new ActivityInboundLogInterceptor(
      makeActivityContext(),
      logger,
      "snowflake"
    );
    const error = new RemoteDatabaseConnectionNotReadonlyError(
      new Error("Connection is not read-only")
    );
    const input = {
      args: [],
      headers: {},
    } satisfies ActivityExecuteInput;
    const next = vi.fn(async () => {
      throw error;
    }) satisfies Next<ActivityInboundCallsInterceptor, "execute">;

    await expect(interceptor.execute(input, next)).rejects.toBe(error);

    expect(mocks.syncFailed).toHaveBeenCalledWith(
      42,
      "remote_database_connection_not_readonly"
    );
    expect(mocks.pauseAndStop).toHaveBeenCalledWith({
      reason: "Stopped on RemoteDatabaseConnectionNotReadonlyError",
    });
  });

  it("pauses the connector when the workspace plan does not allow API access", async () => {
    const interceptor = new ActivityInboundLogInterceptor(
      makeActivityContext(),
      logger,
      "snowflake"
    );
    const error = new Error(
      `Error uploading to dust: ${JSON.stringify({
        error: {
          type: "workspace_can_use_product_required_error",
          message:
            "Your current plan does not allow API access. Please upgrade your plan.",
        },
      })}`
    );
    const input = {
      args: [],
      headers: {},
    } satisfies ActivityExecuteInput;
    const next = vi.fn(async () => {
      throw error;
    }) satisfies Next<ActivityInboundCallsInterceptor, "execute">;

    await expect(interceptor.execute(input, next)).rejects.toBe(error);

    expect(mocks.syncFailed).toHaveBeenCalledWith(
      42,
      "workspace_plan_no_api_access"
    );
    expect(mocks.pauseAndStop).toHaveBeenCalledWith({
      reason: "Stopped on workspace_can_use_product_required_error",
    });
  });

  it("marks third-party configuration failures and pauses the connector", async () => {
    const interceptor = new ActivityInboundLogInterceptor(
      makeActivityContext(),
      logger,
      "snowflake"
    );
    const error = new ThirdPartyConfigurationError(
      new Error("Provider configuration requires user action")
    );
    const input = {
      args: [],
      headers: {},
    } satisfies ActivityExecuteInput;
    const next = vi.fn(async () => {
      throw error;
    }) satisfies Next<ActivityInboundCallsInterceptor, "execute">;

    await expect(interceptor.execute(input, next)).rejects.toBe(error);

    expect(mocks.syncFailed).toHaveBeenCalledWith(
      42,
      "third_party_internal_error"
    );
    expect(mocks.pauseAndStop).toHaveBeenCalledWith({
      reason: "Stopped on ThirdPartyConfigurationError",
    });
  });
});
