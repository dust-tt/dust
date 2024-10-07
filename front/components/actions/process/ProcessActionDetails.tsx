import { Chip, Collapsible, ScanIcon, Tooltip } from "@dust-tt/sparkle";
import type { ProcessActionType } from "@dust-tt/types";
import { PROCESS_ACTION_TOP_K } from "@dust-tt/types";
import { useMemo } from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import { CodeBlock } from "@app/components/assistant/RenderMessageMarkdown";
import type { GetContentToDownloadFunction } from "@app/components/misc/ContentBlockWrapper";
import { ContentBlockWrapper } from "@app/components/misc/ContentBlockWrapper";

export function ProcessActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<ProcessActionType>) {
  return (
    <ActionDetailsWrapper
      actionName="Extract data"
      defaultOpen={defaultOpen}
      visual={ScanIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-slate-900">Query</span>
          <ProcessActionQuery action={action} />
        </div>
        <div>
          <Collapsible defaultOpen={defaultOpen}>
            <Collapsible.Button>
              <span className="text-sm font-bold text-slate-900">Results</span>
            </Collapsible.Button>
            <Collapsible.Panel>
              <ProcessActionOutputDetails action={action} />
            </Collapsible.Panel>
          </Collapsible>
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}

function ProcessActionQuery({ action }: { action: ProcessActionType }) {
  const minProcessingDate = action.outputs?.min_timestamp
    ? new Date(action.outputs.min_timestamp)
    : null;

  const minProcessingDateAsString = minProcessingDate
    ? `${minProcessingDate.toLocaleString("default", {
        month: "short",
      })} ${minProcessingDate.getDate()}`
    : null;

  const overflow =
    action.outputs && action.outputs?.total_chunks >= PROCESS_ACTION_TOP_K;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-normal text-slate-500">
        {makeQueryDescription(action)}
      </p>
      {overflow && (
        <Tooltip
          label={`Too much data to process over time frame. Processed ${action.outputs?.total_documents} documents (for a total of ${action.outputs?.total_tokens} tokens) up to to ${minProcessingDateAsString}.`}
          trigger={
            <Chip
              color="warning"
              label={`Limited processing (up to ${minProcessingDateAsString})`}
            />
          }
        />
      )}
    </div>
  );
}

function makeQueryDescription(action: ProcessActionType) {
  const { relativeTimeFrame } = action.params;

  const timeFrameAsString = relativeTimeFrame
    ? "the last " +
      (relativeTimeFrame.duration > 1
        ? `${relativeTimeFrame.duration} ${relativeTimeFrame.unit}s`
        : `${relativeTimeFrame.unit}`)
    : "all time";

  return `Extracted from ${action.outputs?.total_documents} documents over ${timeFrameAsString}.`;
}

function ProcessActionOutputDetails({ action }: { action: ProcessActionType }) {
  const { outputs } = action;

  const stringifiedOutput = useMemo(
    () => (outputs ? JSON.stringify(outputs.data, null, 2) : ""),
    [outputs]
  );

  const getContentToDownload: GetContentToDownloadFunction = async () => {
    return {
      content: stringifiedOutput,
      filename: `process_action_outputs_${action.id}`,
      type: "application/json",
    };
  };

  if (!outputs) {
    return null;
  }

  return (
    <ContentBlockWrapper
      content={stringifiedOutput}
      getContentToDownload={getContentToDownload}
    >
      <CodeBlock
        className="language-json max-h-60 overflow-y-auto"
        wrapLongLines={true}
      >
        {stringifiedOutput}
      </CodeBlock>
    </ContentBlockWrapper>
  );
}
