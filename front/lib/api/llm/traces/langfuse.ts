import { getLangfuseClient } from "@app/lib/api/langfuse_client";
import type { PokeLangfuseTrace } from "@app/types/api/poke/llm_traces";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export async function fetchLangfuseTraceByDustTraceId(
  auth: { getNonNullableWorkspace: () => { sId: string } },
  { dustTraceId }: { dustTraceId: string }
): Promise<Result<PokeLangfuseTrace | null, Error>> {
  const client = getLangfuseClient();
  if (!client) {
    return new Ok(null);
  }

  const filter = JSON.stringify([
    {
      type: "stringObject",
      column: "metadata",
      key: "dustTraceId",
      operator: "=",
      value: dustTraceId,
    },
  ]);

  try {
    const traces = await client.api.trace.list({ filter, limit: 1 });
    const traceSummary = traces.data?.[0];
    if (
      !traceSummary ||
      traceSummary.userId !== auth.getNonNullableWorkspace().sId
    ) {
      return new Ok(null);
    }

    const trace = await client.api.trace.get(traceSummary.id);
    return new Ok({
      id: trace.id,
      input: trace.input,
      latencySeconds: trace.latency ?? null,
      metadata: trace.metadata,
      name: trace.name,
      observations: trace.observations.map((observation) => ({
        costDetails: observation.costDetails,
        endTime: observation.endTime,
        id: observation.id,
        input: observation.input,
        latencySeconds: observation.latency,
        level: observation.level,
        metadata: observation.metadata,
        model: observation.model,
        name: observation.name,
        output: observation.output,
        startTime: observation.startTime,
        statusMessage: observation.statusMessage,
        timeToFirstTokenSeconds: observation.timeToFirstToken,
        type: observation.type,
        usageDetails: observation.usageDetails,
      })),
      output: trace.output,
      tags: trace.tags,
      timestamp: trace.timestamp,
      totalCostUsd: trace.totalCost ?? null,
    });
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
