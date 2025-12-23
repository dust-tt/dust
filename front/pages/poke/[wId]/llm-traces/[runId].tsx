import {
  Button,
  Chip,
  ClipboardCheckIcon,
  ClipboardIcon,
  CodeBlock,
  Page,
  Spinner,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import PokeLayout from "@app/components/poke/PokeLayout";
import { isLLMTraceId } from "@app/lib/api/llm/traces/buffer";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { usePokeLLMTrace } from "@app/poke/swr";
import type { LightWorkspaceType } from "@app/types";
import { isString } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: LightWorkspaceType;
  runId: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  if (!owner) {
    return {
      notFound: true,
    };
  }

  const wId = context.params?.wId;
  if (!wId || !isString(wId)) {
    return {
      notFound: true,
    };
  }

  const runId = context.params?.runId;
  if (!runId || !isString(runId) || !isLLMTraceId(runId)) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      runId,
    },
  };
});

interface LLMTracePageProps extends InferGetServerSidePropsType<
  typeof getServerSideProps
> {}

const LLMTracePage = ({ owner, runId }: LLMTracePageProps) => {
  const { trace, isLLMTraceLoading, isLLMTraceError } = usePokeLLMTrace({
    workspace: owner,
    runId,
  });

  const [isCopiedJSON, copyJSON] = useCopyToClipboard();

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
        <div className="text-lg font-medium text-red-600">
          Failed to load LLM trace
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          The trace may not exist or there was an error fetching it from GCS.
        </div>
      </div>
    );
  }

  const formatDuration = (durationMs: number) => {
    return durationMs >= 1000
      ? `${(durationMs / 1000).toFixed(1)}s`
      : `${durationMs}ms`;
  };

  const formatTokens = (input?: number, output?: number) => {
    if (input === undefined && output === undefined) {
      return "N/A";
    }
    const inputStr = input !== undefined ? input.toLocaleString() : "?";
    const outputStr = output !== undefined ? output.toLocaleString() : "?";
    return `${inputStr} → ${outputStr}`;
  };

  return (
    <div className="max-w-6xl">
      <Page.Vertical align="stretch">
        <div className="flex items-center space-x-4">
          <div>
            <h1 className="text-2xl font-bold">LLM Trace</h1>
            <div className="text-sm text-muted-foreground">
              Run ID: <code className="text-xs">{runId}</code>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
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
              label={`Tokens: ${formatTokens(
                trace.output.tokenUsage.inputTokens,
                trace.output.tokenUsage.outputTokens
              )}`}
              size="sm"
            />
          )}
          {trace.output?.finishReason && (
            <Chip
              color={
                trace.output.finishReason === "error" ? "warning" : "green"
              }
              label={`Status: ${trace.output.finishReason}`}
              size="sm"
            />
          )}
          {trace.context.operationType && (
            <Chip
              color="primary"
              label={`Type: ${trace.context.operationType}`}
              size="sm"
            />
          )}
          {trace.metadata.bufferTruncated && (
            <Chip color="warning" label="Truncated" size="sm" />
          )}
        </div>

        {/* Actions */}
        <div className="flex space-x-2">
          <Button
            label={isCopiedJSON ? "Copied!" : "Copy JSON"}
            variant="secondary"
            size="sm"
            icon={isCopiedJSON ? ClipboardCheckIcon : ClipboardIcon}
            onClick={() => copyJSON(JSON.stringify(trace, null, 2))}
          />
        </div>

        {/* JSON Viewer */}
        <div className="rounded-lg border">
          <div className="border-b bg-muted px-4 py-2">
            <h3 className="font-medium">Full Trace Data</h3>
          </div>
          <div className="p-4">
            <CodeBlock
              wrapLongLines
              className="language-json max-h-96 overflow-auto"
            >
              {JSON.stringify(trace, null, 2)}
            </CodeBlock>
          </div>
        </div>
      </Page.Vertical>
    </div>
  );
};

LLMTracePage.getLayout = (
  page: ReactElement,
  { owner }: { owner: LightWorkspaceType }
) => {
  return <PokeLayout title={`${owner.name} - LLM Trace`}>{page}</PokeLayout>;
};

export default LLMTracePage;
