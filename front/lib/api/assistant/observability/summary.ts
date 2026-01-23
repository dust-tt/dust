import type { estypes } from "@elastic/elasticsearch";

import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { MessageMetricsPoint } from "@app/lib/api/assistant/observability/messages_metrics";
import { fetchMessageMetrics } from "@app/lib/api/assistant/observability/messages_metrics";
import type { AgentOverview } from "@app/lib/api/assistant/observability/overview";
import { fetchAgentOverview } from "@app/lib/api/assistant/observability/overview";
import type { AgentVersionMarker } from "@app/lib/api/assistant/observability/version_markers";
import { fetchVersionMarkers } from "@app/lib/api/assistant/observability/version_markers";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types";
import { Err, GPT_4_1_MINI_MODEL_ID, Ok } from "@app/types";

export type AgentObservabilitySummaryInput = {
  auth: Authenticator;
  baseQuery: estypes.QueryDslQueryContainer;
  days: number;
  agentName: string;
};

export type AgentObservabilitySummaryResult = {
  summaryText: string;
};

const SUMMARY_METRICS = [
  "conversations",
  "activeUsers",
  "avgLatencyMs",
  "percentilesLatencyMs",
  "failedMessages",
  "errorRate",
] as const satisfies readonly (keyof MessageMetricsPoint)[];

function hasAnyActivity(
  overview: AgentOverview,
  points: Pick<
    MessageMetricsPoint,
    (typeof SUMMARY_METRICS)[number] | "timestamp"
  >[]
) {
  if (
    overview.activeUsers > 0 ||
    overview.conversationCount > 0 ||
    overview.messageCount > 0
  ) {
    return true;
  }

  return points.some(
    (p) =>
      (p.conversations ?? 0) > 0 ||
      (p.activeUsers ?? 0) > 0 ||
      (p.failedMessages ?? 0) > 0
  );
}

export async function generateAgentObservabilitySummary({
  auth,
  baseQuery,
  days,
  agentName,
}: AgentObservabilitySummaryInput): Promise<
  Result<AgentObservabilitySummaryResult, Error>
> {
  const owner = auth.getNonNullableWorkspace();

  const overviewResult = await fetchAgentOverview(baseQuery, days);
  if (overviewResult.isErr()) {
    return new Err(
      new Error(
        `Failed to retrieve agent overview for summary: ${overviewResult.error.message}`
      )
    );
  }

  const usageMetricsResult = await fetchMessageMetrics(
    baseQuery,
    "day",
    SUMMARY_METRICS
  );

  if (usageMetricsResult.isErr()) {
    return new Err(
      new Error(
        `Failed to retrieve usage metrics for summary: ${usageMetricsResult.error.message}`
      )
    );
  }

  const versionMarkersResult = await fetchVersionMarkers(baseQuery);
  if (versionMarkersResult.isErr()) {
    return new Err(
      new Error(
        `Failed to retrieve version markers for summary: ${versionMarkersResult.error.message}`
      )
    );
  }

  const overview = overviewResult.value;
  const points = usageMetricsResult.value;
  const versionMarkers: AgentVersionMarker[] = versionMarkersResult.value;

  if (!hasAnyActivity(overview, points)) {
    return new Ok({
      summaryText:
        "There is not enough activity in this time range to generate a meaningful summary yet.",
    });
  }

  const metricsPayload = {
    days,
    agentName,
    overview,
    versionMarkers,
    usage: points.map((p) => ({
      timestamp: p.timestamp,
      conversations: p.conversations,
      activeUsers: p.activeUsers,
      avgLatencyMs: p.avgLatencyMs,
      p50LatencyMs: p.percentilesLatencyMs,
      failedMessages: p.failedMessages,
      errorRate: p.errorRate,
    })),
  };

  const prompt =
    "You are an analytics assistant. " +
    `You are given time-series metrics about how an AI agent called '${agentName}' is used over a given time range, ` +
    "including version markers that indicate when new versions of the agent were released. " +
    "Write a short natural language summary (2-3 short sentences) describing the most important trends, " +
    "including notable spikes or drops, usage changes, latency, and error-rate patterns. " +
    "Explicitly relate these changes to specific versions when the data suggests a clear improvement or regression after a version marker. " +
    "Focus on the big picture and unusual behavior rather than listing every number. " +
    "If the data is noisy or inconclusive, say so explicitly.";

  const conversation = {
    messages: [
      {
        role: "user" as const,
        name: "",
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(metricsPayload),
          },
        ],
      },
    ],
  };

  const res = await runMultiActionsAgent(
    auth,
    {
      modelId: GPT_4_1_MINI_MODEL_ID,
      providerId: "openai",
    },
    {
      conversation,
      prompt,
      specifications: [],
    },
    {
      context: {
        operationType: "agent_observability_summary",
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  const summaryText = res.value.generation?.trim() ?? "";
  if (!summaryText) {
    return new Err(
      new Error("LLM did not return any text for observability summary.")
    );
  }
  return new Ok({ summaryText });
}
