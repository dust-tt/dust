import { Chip, Collapsible, ScanIcon, Tooltip } from "@dust-tt/sparkle";
import type {
  ProcessActionOutputsType,
  ProcessActionType,
} from "@dust-tt/types";
import { PROCESS_ACTION_TOP_K } from "@dust-tt/types";
import { useMemo } from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import { CodeBlock } from "@app/components/assistant/RenderMessageMarkdown";
import { ClipboardBanner } from "@app/components/misc/ClipboardBanner";

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
              <ProcessActionOutputDetails
                extracted={action.outputs ?? undefined}
              />
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
    <div>
      <p className="text-sm font-normal text-slate-500">
        {makeQueryDescription(action)}
      </p>
      {overflow && (
        <Tooltip
          label={`Too much data to process over time frame. Processed ${action.outputs?.total_documents} documents (for a total of ${action.outputs?.total_tokens} tokens) up to to ${minProcessingDateAsString}`}
        >
          <Chip
            color="warning"
            label={`Limited processing (up to ${minProcessingDateAsString})`}
          />
        </Tooltip>
      )}
    </div>
  );
}

function ProcessActionOutputDetails({
  extracted,
}: {
  extracted?: ProcessActionOutputsType;
}) {
  if (!extracted) {
    return null;
  }

  const stringifiedOutput = useMemo(
    () => JSON.stringify(extracted.data, null, 2),
    [extracted]
  );

  return (
    <ClipboardBanner content={stringifiedOutput}>
      <CodeBlock className="language-json" wrapLongLines={true}>
        {stringifiedOutput}
      </CodeBlock>
    </ClipboardBanner>
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

  return `Extracted from ${timeFrameAsString}.`;
}
