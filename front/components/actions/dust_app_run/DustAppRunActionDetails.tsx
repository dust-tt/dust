import type { GetContentToDownloadFunction } from "@dust-tt/sparkle";
import {
  Citation,
  CitationIcons,
  CitationTitle,
  CodeBlock,
  Collapsible,
  CommandLineIcon,
  ContentBlockWrapper,
  DocumentIcon,
  Icon,
  TableIcon,
} from "@dust-tt/sparkle";
import type {
  DustAppRunActionType,
  SupportedFileContentType,
} from "@dust-tt/types";
import { getDustAppRunResultsFileTitle } from "@dust-tt/types";
import { capitalize } from "lodash";
import { useMemo } from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import { DUST_CONVERSATION_HISTORY_MAGIC_INPUT_KEY } from "@app/lib/api/assistant/actions/constants";

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
          <Collapsible defaultOpen={defaultOpen}>
            <Collapsible.Button>
              <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                Results
              </span>
            </Collapsible.Button>
            <Collapsible.Panel>
              <DustAppRunOutputDetails action={action} />
            </Collapsible.Panel>
          </Collapsible>
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

            <Collapsible defaultOpen={false}>
              <Collapsible.Button>
                <span className="text-sm font-semibold text-muted-foreground dark:text-muted-foreground-night">
                  Preview
                </span>
              </Collapsible.Button>
              <Collapsible.Panel>
                <div className="py-2">
                  <CodeBlock
                    className="language-csv max-h-60 overflow-y-auto"
                    wrapLongLines={true}
                  >
                    {action.resultsFileSnippet}
                  </CodeBlock>
                </div>
              </Collapsible.Panel>
            </Collapsible>
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
