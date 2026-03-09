import { InputTab } from "@app/components/poke/llm_traces/InputTab";
import { OutputTab } from "@app/components/poke/llm_traces/OutputTab";
import { RawJsonTab } from "@app/components/poke/llm_traces/RawJsonTab";
import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import type { TokenUsage } from "@app/lib/api/llm/types/events";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { usePokeLLMTrace } from "@app/poke/swr";
import { isString } from "@app/types/shared/utils/general";
import { pluralize } from "@app/types/shared/utils/string_utils";
import {
  Chip,
  ExternalLinkIcon,
  Page,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";

function formatDuration(durationMs: number) {
  return durationMs >= 1000
    ? `${(durationMs / 1000).toFixed(1)}s`
    : `${durationMs}ms`;
}

function formatTokenUsage({
  inputTokens,
  uncachedInputTokens,
  outputTokens,
}: TokenUsage) {
  const inputStr =
    inputTokens.toLocaleString() +
    (uncachedInputTokens
      ? ` (uncached: ${uncachedInputTokens.toLocaleString()})`
      : "");
  const outputStr = outputTokens.toLocaleString();
  return `${inputStr} → ${outputStr}`;
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

export function LLMTracePage() {
  const owner = useWorkspace();
  useSetPokePageTitle(`${owner.name} - LLM Trace`);

  const runId = useRequiredPathParam("runId");
  const { trace, isLLMTraceLoading, isLLMTraceError } = usePokeLLMTrace({
    workspace: owner,
    runId,
  });

  if (isLLMTraceLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isLLMTraceError || !trace) {
    return (
      <div className="flex h-64 flex-col items-center justify-center">
        <div className="text-lg font-medium text-warning dark:text-warning-night">
          Failed to load LLM trace
        </div>
        <div className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
          The trace may not exist or there was an error fetching it from GCS.
        </div>
      </div>
    );
  }

  const toolCallCount = trace?.output?.toolCalls?.length;

  return (
    <div className="max-w-6xl">
      <Page.Vertical align="stretch">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">LLM Trace</h1>
            <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Run ID: <code className="text-xs">{runId}</code>
            </div>
          </div>
        </div>

        {(isString(trace.context.agentConfigurationId) ||
          isString(trace.context.conversationId)) && (
          <div className="flex flex-wrap gap-2">
            {trace.context.agentConfigurationId && (
              <Chip
                color="rose"
                label={`Agent: ${trace.context.agentConfigurationId}`}
                size="sm"
                href={`/poke/${owner.sId}/assistants/${trace.context.agentConfigurationId}`}
                icon={ExternalLinkIcon}
              />
            )}
            {trace.context.conversationId && (
              <Chip
                color="golden"
                label={`Conversation`}
                size="sm"
                href={`/poke/${owner.sId}/conversation/${trace.context.conversationId}`}
                icon={ExternalLinkIcon}
              />
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Chip
            color="blue"
            label={`Model: ${trace.input.modelId}`}
            size="sm"
          />
          <Chip
            color="info"
            label={`Duration: ${formatDuration(trace.metadata.durationMs)}`}
            size="sm"
          />
          {trace.output?.tokenUsage && (
            <Chip
              color="highlight"
              label={`Tokens: ${formatTokenUsage(trace.output.tokenUsage)}`}
              size="sm"
            />
          )}
          {trace.output?.finishReason && (
            <Chip
              color={
                trace.output.finishReason === "error" ? "warning" : "green"
              }
              label={`Finish reason: ${trace.output.finishReason}`}
              size="sm"
            />
          )}
          {trace.context.operationType && (
            <Chip
              color="highlight"
              label={`Type: ${trace.context.operationType}`}
              size="sm"
            />
          )}
          {trace.metadata.bufferTruncated && (
            <Chip color="warning" label="Truncated" size="sm" />
          )}
        </div>

        {trace.error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-semibold text-red-800 dark:text-red-200">
                Error
              </span>
              {trace.error.partialCompletion && (
                <Chip color="warning" label="Partial completion" size="xs" />
              )}
            </div>
            <p className="text-sm text-warning dark:text-warning-night">
              {trace.error.message}
            </p>
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              Timestamp: {formatTimestamp(trace.error.timestamp)}
              {trace.error.providerRunId && (
                <span className="ml-4">
                  Provider Run ID: {trace.error.providerRunId}
                </span>
              )}
            </p>
          </div>
        )}

        <Tabs defaultValue="input">
          <TabsList>
            <TabsTrigger
              value="input"
              label={`Input (${trace.input.conversation.messages.length} messages)`}
            />
            <TabsTrigger
              value="output"
              label={`Output (${toolCallCount ? `${toolCallCount} tool call${pluralize(toolCallCount)}` : "Generation"})`}
            />
            <TabsTrigger value="raw" label="Raw JSON" />
          </TabsList>

          <TabsContent value="input">
            <InputTab input={trace.input} />
          </TabsContent>

          <TabsContent value="output">
            <OutputTab output={trace.output} />
          </TabsContent>

          <TabsContent value="raw">
            <RawJsonTab trace={trace} />
          </TabsContent>
        </Tabs>
      </Page.Vertical>
    </div>
  );
}
