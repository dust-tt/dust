/**
 * StatsD emission for per-call LLM token usage. Called once per model response, at the single
 * point where every provider's usage report has been normalized into TokenUsageContent. The
 * cache split (hit vs created vs uncached) is the ground truth for prompt-cache health: the
 * conversation pruning system's whole goal is keeping the hit share high, so these series are
 * what its checkpoint constants get tuned against.
 *
 * Tag keys follow the llm_* metric family (client_id, model_id) so these series join with
 * llm_interaction.count and friends in Datadog. The operation tag separates streaming traffic
 * from batch: batch entries never benefit from a warm prompt cache, so mixing them in would
 * dilute the hit-ratio series this exists to track.
 *
 * Zero values are skipped. They contribute nothing to the sum aggregations the dashboards use,
 * and they would distort per-kind averages and mint constant-zero series for cache kinds a
 * provider never reports.
 */
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import type { TokenUsageContent } from "@app/lib/model_constructors/types/output/events";
import { getStatsDClient } from "@app/lib/utils/statsd";

export function emitTokenUsageMetrics(
  content: TokenUsageContent,
  metadata: LLMClientMetadata,
  operation: "stream" | "batch"
): void {
  const statsD = getStatsDClient();
  const tags = [
    `client_id:${metadata.clientId}`,
    `model_id:${metadata.modelId}`,
    `operation:${operation}`,
  ];

  // `cacheCreated` is only set when the provider reports a flat total with no per-duration
  // breakdown. Otherwise the split lives in long/short.
  const cacheCreated =
    content.cacheCreated > 0
      ? content.cacheCreated
      : content.longCacheCreated + content.shortCacheCreated;

  const inputByKind: Array<[string, number]> = [
    ["cache_hit", content.cacheHit],
    ["cache_created", cacheCreated],
    ["uncached", content.standardInput],
  ];
  for (const [kind, value] of inputByKind) {
    if (value > 0) {
      statsD.distribution("llm_usage.input_tokens", value, [
        ...tags,
        `kind:${kind}`,
      ]);
    }
  }
  if (content.standardOutput > 0) {
    statsD.distribution(
      "llm_usage.output_tokens",
      content.standardOutput,
      tags
    );
  }
}
