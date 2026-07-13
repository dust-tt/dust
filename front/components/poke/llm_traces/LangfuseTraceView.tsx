import type {
  PokeLangfuseObservation,
  PokeLangfuseTrace,
} from "@app/types/api/poke/llm_traces";
import {
  Chip,
  CodeBlock,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";

function formatDurationSeconds(durationSeconds: number | null): string {
  if (durationSeconds === null) {
    return "unknown";
  }
  if (durationSeconds >= 1) {
    return `${durationSeconds.toFixed(2)}s`;
  }
  return `${Math.round(durationSeconds * 1_000)}ms`;
}

function formatCost(costUsd: number | null): string {
  if (costUsd === null) {
    return "unknown";
  }
  return `$${costUsd.toFixed(costUsd < 0.01 ? 5 : 3)}`;
}

function getGenerationObservation(
  trace: PokeLangfuseTrace
): PokeLangfuseObservation | undefined {
  return trace.observations.find(
    (observation) =>
      observation.type.toLowerCase() === "generation" ||
      observation.name === "llm-completion"
  );
}

function getUsage(
  observation: PokeLangfuseObservation | undefined,
  key: string
): number {
  return observation?.usageDetails[key] ?? 0;
}

export function LangfuseTraceView({ trace }: { trace: PokeLangfuseTrace }) {
  const generation = getGenerationObservation(trace);
  const inputTokens = getUsage(generation, "input");
  const outputTokens = getUsage(generation, "output");
  const cacheReadTokens = getUsage(generation, "cache_read_input_tokens");
  const cacheCreationTokens = getUsage(
    generation,
    "cache_creation_input_tokens"
  );
  const totalCostUsd =
    trace.totalCostUsd ?? generation?.costDetails.total ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">
              Recorded Langfuse generation
            </h2>
            <Chip color="success" label="Historical data" size="xs" />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(trace.timestamp).toLocaleString()} · {trace.id}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {generation?.model && (
            <Chip color="highlight" label={generation.model} size="sm" />
          )}
          <Chip
            color="info"
            label={`${inputTokens.toLocaleString()} input → ${outputTokens.toLocaleString()} output`}
            size="sm"
          />
          <Chip
            color="primary"
            label={`${cacheReadTokens.toLocaleString()} cache read`}
            size="sm"
          />
          {cacheCreationTokens > 0 && (
            <Chip
              color="primary"
              label={`${cacheCreationTokens.toLocaleString()} cache write`}
              size="sm"
            />
          )}
          <Chip
            color="info"
            label={formatDurationSeconds(
              generation?.latencySeconds ?? trace.latencySeconds
            )}
            size="sm"
          />
          <Chip color="success" label={formatCost(totalCostUsd)} size="sm" />
        </div>
      </div>

      {generation?.statusMessage && (
        <div className="rounded-lg border border-warning-300 bg-warning-50 p-3 text-sm text-warning-900">
          {generation.statusMessage}
        </div>
      )}

      <Tabs defaultValue="input">
        <TabsList>
          <TabsTrigger value="input" label="Provider input" />
          <TabsTrigger value="output" label="Provider output" />
          <TabsTrigger value="metadata" label="Metadata" />
          <TabsTrigger value="raw" label="Raw Langfuse trace" />
        </TabsList>
        <TabsContent value="input">
          <div className="pt-3">
            <CodeBlock wrapLongLines className="language-json">
              {JSON.stringify(generation?.input ?? trace.input, null, 2)}
            </CodeBlock>
          </div>
        </TabsContent>
        <TabsContent value="output">
          <div className="pt-3">
            <CodeBlock wrapLongLines className="language-json">
              {JSON.stringify(generation?.output ?? trace.output, null, 2)}
            </CodeBlock>
          </div>
        </TabsContent>
        <TabsContent value="metadata">
          <div className="pt-3">
            <CodeBlock wrapLongLines className="language-json">
              {JSON.stringify(
                {
                  generation: generation?.metadata,
                  trace: trace.metadata,
                  usage: generation?.usageDetails,
                  cost: generation?.costDetails,
                  timeToFirstTokenSeconds: generation?.timeToFirstTokenSeconds,
                },
                null,
                2
              )}
            </CodeBlock>
          </div>
        </TabsContent>
        <TabsContent value="raw">
          <div className="pt-3">
            <CodeBlock wrapLongLines className="language-json">
              {JSON.stringify(trace, null, 2)}
            </CodeBlock>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
