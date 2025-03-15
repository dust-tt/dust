import type { GetContentToDownloadFunction } from "@dust-tt/sparkle";
import {
  Chip,
  CodeBlock,
  CollapsibleComponent,
  ContentBlockWrapper,
  ScanIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { ProcessActionType } from "@app/lib/actions/types/process";
import { PROCESS_ACTION_TOP_K } from "@app/lib/actions/types/process";

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
          <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
            Query
          </span>
          <ProcessActionQuery action={action} />
        </div>
        <div>
          <CollapsibleComponent
            rootProps={{ defaultOpen }}
            triggerProps={{}}
            triggerChildren={
              <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                Results
              </span>
            }
            contentChildren={<ProcessActionOutputDetails action={action} />}
          />
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
      <p className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
        {makeQueryDescription(action)}
      </p>
      {overflow && (
        <div>
          <Tooltip
            label={`Too much data to process over time frame. Processed ${action.outputs?.total_documents} documents (for a total of ${action.outputs?.total_tokens} tokens) up to to ${minProcessingDateAsString}.`}
            trigger={
              <Chip
                color="warning"
                label={`Limited processing (up to ${minProcessingDateAsString})`}
              />
            }
          />
        </div>
      )}
    </div>
  );
}

function makeQueryDescription(action: ProcessActionType) {
  const { relativeTimeFrame, tagsIn, tagsNot } = action.params;

  const tagsInAsString =
    tagsIn && tagsIn.length > 0 ? `, with labels ${tagsIn?.join(", ")}` : "";
  const tagsNotAsString =
    tagsNot && tagsNot.length > 0
      ? `, excluding labels ${tagsNot?.join(", ")}`
      : "";

  const timeFrameAsString = relativeTimeFrame
    ? "the last " +
      (relativeTimeFrame.duration > 1
        ? `${relativeTimeFrame.duration} ${relativeTimeFrame.unit}s`
        : `${relativeTimeFrame.unit}`)
    : "all time";

  if (action.outputs?.total_documents) {
    return `Extracted from ${action.outputs?.total_documents} documents over ${timeFrameAsString}${tagsInAsString}${tagsNotAsString}.`;
  } else {
    return `Extracted from documents over ${timeFrameAsString}${tagsInAsString}${tagsNotAsString}.`;
  }
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
