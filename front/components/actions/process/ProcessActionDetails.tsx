import type { GetContentToDownloadFunction } from "@dust-tt/sparkle";
import {
  Chip,
  Citation,
  CitationIcons,
  CitationTitle,
  CodeBlock,
  CollapsibleComponent,
  ContentBlockWrapper,
  Icon,
  ScanIcon,
  Tooltip,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useCallback, useMemo } from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import { PROCESS_ACTION_TOP_K } from "@app/lib/actions/constants";
import type { ProcessActionType } from "@app/lib/actions/process";
import { getExtractFileTitle } from "@app/lib/actions/process/utils";
import type { LightWorkspaceType } from "@app/types";

export function ProcessActionDetails({
  action,
  defaultOpen,
  owner,
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
            contentChildren={
              <ProcessActionOutputDetails action={action} owner={owner} />
            }
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

function ProcessActionOutputDetails({
  action,
  owner,
}: {
  action: ProcessActionType;
  owner: LightWorkspaceType;
}) {
  const { outputs } = action;
  const sendNotification = useSendNotification();

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

  const handleDownload = useCallback(() => {
    if (action.jsonFileId) {
      try {
        const downloadUrl = `/api/w/${owner.sId}/files/${action.jsonFileId}?action=download`;
        window.open(downloadUrl, "_blank");
      } catch (error) {
        console.error("Download failed:", error);
        sendNotification({
          title: "Download Failed",
          type: "error",
          description: "An error occurred while opening the download link.",
        });
      }
    } else {
      sendNotification({
        title: "No Results Available",
        type: "error",
        description: "There are no results available to download.",
      });
    }
  }, [action.jsonFileId, sendNotification, owner.sId]);

  if (!outputs) {
    return null;
  }

  if (outputs.data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        No data was extracted.
      </div>
    );
  }

  const fileTitle = getExtractFileTitle({ schema: action.jsonSchema });

  return (
    <div className="flex flex-col gap-4">
      {action.jsonFileId ? (
        <>
          <div>
            <Citation
              className="w-48 min-w-48 max-w-48"
              containerClassName="my-2"
              onClick={handleDownload}
              tooltip={fileTitle}
            >
              <CitationIcons>
                <Icon visual={ScanIcon} />
              </CitationIcons>
              <CitationTitle>{fileTitle}</CitationTitle>
            </Citation>
          </div>

          <CollapsibleComponent
            rootProps={{ defaultOpen: false }}
            triggerChildren={
              <span className="text-sm font-semibold text-muted-foreground dark:text-muted-foreground-night">
                Preview
              </span>
            }
            contentChildren={
              <div className="py-2">
                <CodeBlock
                  className="language-json max-h-60 overflow-y-auto"
                  wrapLongLines={true}
                >
                  {action.jsonFileSnippet}
                </CodeBlock>
              </div>
            }
          />
        </>
      ) : (
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
      )}
    </div>
  );
}
