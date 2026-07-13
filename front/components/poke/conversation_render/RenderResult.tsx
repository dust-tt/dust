import {
  ContextBudget,
  formatTokens,
  percentage,
  TokenSummaryCard,
} from "@app/components/poke/conversation_render/ContextBudget";
import { LangfuseTraceView } from "@app/components/poke/llm_traces/LangfuseTraceView";
import type { PostRenderConversationResponseBody } from "@app/types/api/poke/conversation_render";
import type { PokeLangfuseTrace } from "@app/types/api/poke/llm_traces";
import type { PokeAgentMessageType } from "@app/types/poke";
import {
  Button,
  Chip,
  Clipboard,
  ClipboardCheck,
  CodeBlock,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  LinkExternal01,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useCopyToClipboard,
} from "@dust-tt/sparkle";

export type RenderTarget = {
  key: string;
  label: string;
  message: PokeAgentMessageType;
  steps: number[];
};

function getLangfuseTraceUrl(langfuseUiBaseUrl: string, runId: string) {
  return `${langfuseUiBaseUrl}/traces?filter=metadata%3BstringObject%3BdustTraceId%3B%3D%3B${encodeURIComponent(runId)}`;
}

function TraceLinks({
  target,
  langfuseUiBaseUrl,
  workspaceId,
}: {
  target: RenderTarget | undefined;
  langfuseUiBaseUrl: string | null;
  workspaceId: string;
}) {
  const traces = target?.message.runUrls?.filter((run) => run.isLLM) ?? [];
  if (traces.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-separator bg-background p-4">
      <h2 className="text-sm font-semibold text-foreground">
        Recorded model calls
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Compare this live reconstruction with the input captured when the run
        happened.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {traces.map(({ runId, url }, index) => (
          <div
            key={runId}
            className="flex items-center gap-1 rounded-lg border border-separator bg-muted-background p-1"
          >
            <Button
              href={`/poke/${workspaceId}/llm-traces/${runId}`}
              label={`Poke input ${index + 1}`}
              variant="ghost"
              size="xs"
              target="_blank"
            />
            <Button
              href={url}
              label="Trace"
              variant="ghost"
              size="xs"
              target="_blank"
              icon={LinkExternal01}
            />
            {langfuseUiBaseUrl && (
              <Button
                href={getLangfuseTraceUrl(langfuseUiBaseUrl, runId)}
                label="Langfuse"
                variant="ghost"
                size="xs"
                target="_blank"
                icon={LinkExternal01}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function RenderResult({
  result,
  target,
  langfuseError,
  langfuseTrace,
  langfuseUiBaseUrl,
  workspaceId,
}: {
  result: PostRenderConversationResponseBody;
  target: RenderTarget | undefined;
  langfuseError: string | null;
  langfuseTrace: PokeLangfuseTrace | null;
  langfuseUiBaseUrl: string | null;
  workspaceId: string;
}) {
  const [isCopiedJSON, copyJSON] = useCopyToClipboard();
  const { counts, messageBreakdown, pruning, tokenCounts } = result.diagnostics;
  const utilization = percentage(tokenCounts.total, tokenCounts.allowed);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-info-300 bg-info-50 p-4 text-sm text-info-900">
        <div className="font-semibold">
          {result.reconstruction.mode === "historical_step"
            ? "Runtime-path reconstruction"
            : "Synthetic live preview"}
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
          {result.reconstruction.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TokenSummaryCard
          label="Input used"
          value={`${utilization.toFixed(1)}%`}
          detail={`${formatTokens(tokenCounts.total)} of ${formatTokens(tokenCounts.allowed)} tokens`}
        />
        <TokenSummaryCard
          label="Headroom"
          value={formatTokens(tokenCounts.remaining)}
          detail="Tokens available before the input ceiling"
        />
        <TokenSummaryCard
          label="Messages"
          value={formatTokens(counts.modelMessageCount)}
          detail={`${formatTokens(counts.selectedInteractionCount)} of ${formatTokens(counts.renderedInteractionCount)} interactions selected`}
        />
        <TokenSummaryCard
          label="Output reserve"
          value={formatTokens(result.model.generationTokensCount)}
          detail={`${result.model.modelId} · ${formatTokens(result.modelContextSizeUsed)} context`}
        />
      </div>

      {(pruning.currentInteractionPruned ||
        pruning.previousInteractionsPruned ||
        pruning.omittedInteractionCount > 0) && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-warning-300 bg-warning-50 p-4">
          {pruning.previousInteractionsPruned && (
            <Chip
              color="warning"
              label="Previous tool results pruned"
              size="sm"
            />
          )}
          {pruning.currentInteractionPruned && (
            <Chip
              color="warning"
              label="Current tool results pruned"
              size="sm"
            />
          )}
          {pruning.omittedInteractionCount > 0 && (
            <Chip
              color="warning"
              label={`${pruning.omittedInteractionCount} interaction${pruning.omittedInteractionCount > 1 ? "s" : ""} omitted`}
              size="sm"
            />
          )}
        </div>
      )}

      <ContextBudget result={result} />
      <TraceLinks
        target={target}
        langfuseUiBaseUrl={langfuseUiBaseUrl}
        workspaceId={workspaceId}
      />
      {langfuseTrace && (
        <section className="rounded-xl border border-separator bg-background p-5">
          <LangfuseTraceView trace={langfuseTrace} />
        </section>
      )}
      {langfuseError && (
        <div className="rounded-xl border border-warning-300 bg-warning-50 p-4 text-sm text-warning-900">
          Langfuse data could not be loaded: {langfuseError}
        </div>
      )}

      <Tabs defaultValue="messages">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="messages" label="Messages" />
            <TabsTrigger value="prompt" label="System prompt" />
            <TabsTrigger value="tools" label="Tools" />
            <TabsTrigger value="raw" label="Raw payload" />
          </TabsList>
          <Button
            label={isCopiedJSON ? "Copied" : "Copy payload"}
            variant="outline"
            size="sm"
            icon={isCopiedJSON ? ClipboardCheck : Clipboard}
            onClick={() => copyJSON(JSON.stringify(result, null, 2))}
          />
        </div>

        <TabsContent value="messages">
          <div className="space-y-2 pt-4">
            {messageBreakdown.map((messageDiagnostic) => {
              const message =
                result.modelConversation.messages[messageDiagnostic.index];
              return (
                <Collapsible
                  key={`${messageDiagnostic.index}-${messageDiagnostic.role}`}
                  defaultOpen={false}
                  className="rounded-xl border border-separator bg-background p-4"
                >
                  <CollapsibleTrigger>
                    <div className="flex w-full min-w-0 items-center justify-between gap-4 pr-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Chip
                          color={
                            messageDiagnostic.role === "user"
                              ? "highlight"
                              : messageDiagnostic.role === "assistant"
                                ? "success"
                                : "info"
                          }
                          label={messageDiagnostic.role}
                          size="xs"
                        />
                        <span className="truncate text-sm text-muted-foreground">
                          {messageDiagnostic.name ??
                            `Message ${messageDiagnostic.index + 1}`}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
                        {formatTokens(messageDiagnostic.tokenCount)} tokens
                      </span>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CodeBlock wrapLongLines className="language-json mt-3">
                      {JSON.stringify(message, null, 2)}
                    </CodeBlock>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="prompt">
          <div className="pt-4">
            <p className="mb-2 text-sm text-muted-foreground">
              {formatTokens(tokenCounts.prompt)} tokens ·{" "}
              {formatTokens(result.prompt.length)} characters
            </p>
            <CodeBlock wrapLongLines>{result.prompt}</CodeBlock>
          </div>
        </TabsContent>

        <TabsContent value="tools">
          <div className="space-y-3 pt-4">
            <div className="flex flex-wrap gap-2">
              <Chip
                color="info"
                label={`${result.toolDefinitionsInContext.length} definitions in context`}
                size="sm"
              />
              <Chip
                color="primary"
                label={`${result.toolSpecifications.length} specifications sent to the provider`}
                size="sm"
              />
              <Chip
                color={
                  result.runtimeContext.toolSearchEnabled
                    ? "success"
                    : "primary"
                }
                label={
                  result.runtimeContext.toolSearchEnabled
                    ? "Tool search enabled"
                    : "Tool search disabled"
                }
                size="sm"
              />
              <Chip
                color="highlight"
                label={`${formatTokens(tokenCounts.toolDefinitionsRaw)} raw → ${formatTokens(tokenCounts.toolDefinitionsAdjusted)} budgeted tokens`}
                size="sm"
              />
            </div>
            <CodeBlock wrapLongLines className="language-json">
              {JSON.stringify(result.toolDefinitionsInContext, null, 2)}
            </CodeBlock>
            <Collapsible
              defaultOpen={false}
              className="rounded-xl border border-separator bg-background p-4"
            >
              <CollapsibleTrigger
                label={`All provider specifications (${result.toolSpecifications.length})`}
              />
              <CollapsibleContent>
                <CodeBlock wrapLongLines className="language-json mt-3">
                  {JSON.stringify(result.toolSpecifications, null, 2)}
                </CodeBlock>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </TabsContent>

        <TabsContent value="raw">
          <div className="pt-4">
            <CodeBlock wrapLongLines className="language-json">
              {JSON.stringify(result, null, 2)}
            </CodeBlock>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
