import type { GetContentToDownloadFunction } from "@dust-tt/sparkle";
import {
  Citation,
  CitationIcons,
  CitationTitle,
  CodeBlock,
  CollapsibleComponent,
  CommandLineIcon,
  ContentBlockWrapper,
  DocumentIcon,
  Icon,
  TableIcon,
} from "@dust-tt/sparkle";
import { capitalize } from "lodash";
import { useMemo } from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import { getDustAppRunResultsFileTitle } from "@app/components/actions/dust_app_run/utils";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import { DUST_CONVERSATION_HISTORY_MAGIC_INPUT_KEY } from "@app/lib/actions/constants";
import type { DustAppRunActionType } from "@app/lib/actions/dust_app_run";
import type { SupportedFileContentType } from "@app/types";

function ContentTypeIcon({
  contentType,
}: {
  contentType: SupportedFileContentType;
}) {
  switch (contentType) {
    case "text/csv":
      return <Icon visual={TableIcon} />;
    default:
      return <Icon visual={DocumentIcon} />;
  }
}

export function DustAppRunActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<DustAppRunActionType>) {
  return (
    <ActionDetailsWrapper
      actionName={`Run ${action.appName}`}
      defaultOpen={defaultOpen}
      visual={CommandLineIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-foreground dark:text-foreground-night">
            Parameters
          </span>
          <div className="text-muted-foreground dark:text-muted-foreground-night">
            <DustAppRunParamsDetails action={action} />
          </div>
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
            contentChildren={<DustAppRunOutputDetails action={action} />}
          />
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}

function DustAppRunParamsDetails({ action }: { action: DustAppRunActionType }) {
  const { params } = action;

  return (
    <div className="flex flex-col gap-0.5">
      {Object.entries(params)
        .filter(([k]) => k !== DUST_CONVERSATION_HISTORY_MAGIC_INPUT_KEY)
        .map(([k, v], idx) => (
          <p key={idx}>
            <span className="font-semibold">{capitalize(k)}:</span>
            {` ${v}`}
          </p>
        ))}
    </div>
  );
}

function DustAppRunOutputDetails({ action }: { action: DustAppRunActionType }) {
  const stringifiedOutput = useMemo(
    () => JSON.stringify(action.output, null, 2),
    [action.output]
  );

  const getContentToDownload: GetContentToDownloadFunction = async () => {
    return {
      content: stringifiedOutput,
      filename: `app_runs_outputs_${action.id}`,
      type: "application/json",
    };
  };

  if (!action.output) {
    return null;
  }

  const shouldDisplayRawOutput =
    !action.resultsFileId ||
    (stringifiedOutput.length && stringifiedOutput != "{}");

  return (
    <div className="flex flex-col gap-4">
      {action.resultsFileId &&
        action.resultsFileSnippet &&
        action.resultsFileContentType && (
          <div>
            <Citation
              className="w-48 min-w-48 max-w-48"
              containerClassName="my-2"
              tooltip={getDustAppRunResultsFileTitle({
                appName: action.appName,
                resultsFileContentType: action.resultsFileContentType,
              })}
            >
              <CitationIcons>
                <ContentTypeIcon contentType={action.resultsFileContentType} />
              </CitationIcons>
              <CitationTitle>
                {getDustAppRunResultsFileTitle({
                  appName: action.appName,
                  resultsFileContentType: action.resultsFileContentType,
                })}
              </CitationTitle>
            </Citation>

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
                    className="language-csv max-h-60 overflow-y-auto"
                    wrapLongLines={true}
                  >
                    {action.resultsFileSnippet}
                  </CodeBlock>
                </div>
              }
            />
          </div>
        )}

      {shouldDisplayRawOutput && (
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
