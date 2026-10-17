import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { TemporalNamespace } from "@app/lib/api/actions/servers/temporal/metadata";
import { getFeatureFlags } from "@app/lib/auth";
import {
  getTemporalClientForAgentNamespace,
  getTemporalClientForConnectorsNamespace,
  getTemporalClientForFrontNamespace,
} from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { isDustWorkspace } from "@app/types/shared/env";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type {
  Client,
  ProtoFailure,
  WorkflowExecutionInfo,
} from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";
import type { Payload, Timestamp } from "@temporalio/common";
import { decodeTimeoutType, defaultPayloadConverter } from "@temporalio/common";

const MAX_PAYLOAD_CHARS = 1000;
const MAX_STACK_TRACE_CHARS = 1500;
const MAX_FAILURE_CAUSE_DEPTH = 3;

/**
 * @cc [owner:tdraier,label:security;mcp] gate-conditions
 * Returns `Ok` only when the caller is a Dust super user, acting from a Dust-internal workspace,
 * with the `temporal_mcp` feature flag enabled on that workspace at execution time; returns
 * `Err(MCPError)` otherwise. Every successful call emits an info log with the caller and tool.
 */
export async function enforceTemporalSecurityGates(
  { auth }: ToolHandlerExtra,
  toolName: string
): Promise<Result<void, MCPError>> {
  const callerWorkspace = auth.getNonNullableWorkspace();
  const callerUser = auth.user();

  if (!callerUser?.isDustSuperUser) {
    return new Err(
      new MCPError(
        "Access denied: Temporal tools require Dust super user privileges.",
        { tracked: false }
      )
    );
  }

  if (!isDustWorkspace(callerWorkspace)) {
    return new Err(
      new MCPError(
        "Access denied: Temporal tools can only be used from a Dust-internal workspace.",
        { tracked: false }
      )
    );
  }

  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("temporal_mcp")) {
    return new Err(
      new MCPError(
        "Access denied: the temporal_mcp feature flag is not enabled on this workspace.",
        { tracked: false }
      )
    );
  }

  logger.info(
    {
      action: "temporal_mcp_access",
      callerUserId: callerUser.sId,
      workspaceId: callerWorkspace.sId,
      tool: toolName,
    },
    "Temporal MCP: tool access"
  );

  return new Ok(undefined);
}

export function jsonResponse(data: unknown): ToolHandlerResult {
  return new Ok([
    { type: "text" as const, text: JSON.stringify(data, null, 2) },
  ]);
}

// Always go through the namespace-specific getters: Temporal clients are cached per namespace, so
// the first caller decides the interceptors of the client used by the whole process.
export async function getTemporalClient(
  namespace: TemporalNamespace
): Promise<Client> {
  switch (namespace) {
    case "agent":
      return getTemporalClientForAgentNamespace();
    case "front":
      return getTemporalClientForFrontNamespace();
    case "connectors":
      return getTemporalClientForConnectorsNamespace();
    default:
      assertNever(namespace);
  }
}

export function temporalErrorToMCPError(err: unknown): MCPError {
  if (err instanceof WorkflowNotFoundError) {
    return new MCPError(`Workflow not found: ${err.message}`, {
      tracked: false,
    });
  }
  const error = normalizeError(err);
  return new MCPError(`Temporal request failed: ${error.message}`, {
    tracked: false,
    cause: error,
  });
}

// Accepts both protobuf Timestamps and Durations, which share the same shape.
export function protoTimeToMs(
  time: Timestamp | null | undefined
): number | null {
  if (!time) {
    return null;
  }
  return Number(time.seconds ?? 0) * 1000 + Math.floor((time.nanos ?? 0) / 1e6);
}

export function protoTimeToIso(
  time: Timestamp | null | undefined
): string | null {
  const ms = protoTimeToMs(time);
  return ms === null ? null : new Date(ms).toISOString();
}

export function makeTemporalUiUrl(
  client: Client,
  { workflowId, runId }: { workflowId: string; runId: string }
): string {
  return (
    `https://cloud.temporal.io/namespaces/${encodeURIComponent(client.options.namespace)}` +
    `/workflows/${encodeURIComponent(workflowId)}/${encodeURIComponent(runId)}/history`
  );
}

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars
    ? `${text.slice(0, maxChars)}… [truncated ${text.length - maxChars} chars]`
    : text;
}

export function decodePayloads(
  payloads: { payloads?: Payload[] | null } | null | undefined
): string[] | null {
  if (!payloads?.payloads?.length) {
    return null;
  }
  return payloads.payloads.map((payload) => {
    try {
      const decoded: unknown = defaultPayloadConverter.fromPayload(payload);
      return truncate(
        JSON.stringify(decoded) ?? "undefined",
        MAX_PAYLOAD_CHARS
      );
    } catch {
      return "[undecodable payload]";
    }
  });
}

export type FailureSummary = {
  message: string | null;
  source: string | null;
  type: string | null;
  nonRetryable: boolean | null;
  timeoutType: string | null;
  stackTrace: string | null;
  cause: FailureSummary | null;
};

export function summarizeFailure(
  failure: ProtoFailure | null | undefined,
  depth = 0
): FailureSummary | null {
  if (!failure) {
    return null;
  }
  return {
    message: failure.message ?? null,
    source: failure.source || null,
    type: failure.applicationFailureInfo?.type || null,
    nonRetryable: failure.applicationFailureInfo?.nonRetryable ?? null,
    timeoutType:
      decodeTimeoutType(failure.timeoutFailureInfo?.timeoutType) ?? null,
    stackTrace: failure.stackTrace
      ? truncate(failure.stackTrace, MAX_STACK_TRACE_CHARS)
      : null,
    cause:
      depth < MAX_FAILURE_CAUSE_DEPTH
        ? summarizeFailure(failure.cause, depth + 1)
        : null,
  };
}

export function summarizeWorkflowExecutionInfo(
  client: Client,
  info: Omit<WorkflowExecutionInfo, "raw">
) {
  const startMs = info.startTime.getTime();
  const endMs = info.closeTime?.getTime() ?? Date.now();
  return {
    workflowId: info.workflowId,
    runId: info.runId,
    type: info.type,
    status: info.status.name,
    taskQueue: info.taskQueue,
    startTime: info.startTime.toISOString(),
    closeTime: info.closeTime?.toISOString() ?? null,
    durationMs: endMs - startMs,
    historyLength: info.historyLength,
    historySizeBytes: info.historySize ?? null,
    parentWorkflowId: info.parentExecution?.workflowId ?? null,
    searchAttributes: Object.fromEntries(
      info.typedSearchAttributes
        .getAll()
        .map((pair) => [pair.key.name, pair.value])
    ),
    memo: info.memo ?? null,
    temporalUiUrl: makeTemporalUiUrl(client, info),
  };
}
