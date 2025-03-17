import {
  Citation,
  CitationIcons,
  CitationTitle,
  CodeBlock,
  CollapsibleComponent,
  ContentBlockWrapper,
  ContentMessage,
  Icon,
  InformationCircleIcon,
  Markdown,
  TableIcon,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useCallback } from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import { getTablesQueryResultsFileTitle } from "@app/components/actions/tables_query/utils";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { TablesQueryActionType } from "@app/lib/actions/tables_query";
import type { LightWorkspaceType } from "@app/types";

export function TablesQueryActionDetails({
  action,
  defaultOpen,
  owner,
}: ActionDetailsComponentBaseProps<TablesQueryActionType>) {
  return (
    <ActionDetailsWrapper
      actionName="Query tables"
      defaultOpen={defaultOpen}
      visual={TableIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <QueryThinking action={action} />
        <TablesQuery action={action} />
        <QueryTablesResults action={action} owner={owner} />
      </div>
    </ActionDetailsWrapper>
  );
}

function TablesQuery({ action }: { action: TablesQueryActionType }) {
  const { output } = action;
  const query = typeof output?.query === "string" ? output.query : null;

  if (!query) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
        Query
      </span>
      <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
        <ContentBlockWrapper content={query}>
          <CodeBlock
            className="language-sql max-h-60 overflow-y-auto"
            wrapLongLines={true}
          >
            {query}
          </CodeBlock>
        </ContentBlockWrapper>
      </div>
    </div>
  );
}

function QueryThinking({ action }: { action: TablesQueryActionType }) {
  const { output } = action;
  const thinking =
    typeof output?.thinking === "string" ? output.thinking : null;
  if (!thinking) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
        Reasoning
      </span>
      <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
        <ContentMessage
          title="Reasoning"
          variant="slate"
          icon={InformationCircleIcon}
          size="lg"
        >
          <Markdown
            content={thinking}
            isStreaming={false}
            forcedTextSize="text-sm"
            textColor="text-muted-foreground"
            isLastMessage={false}
          />
        </ContentMessage>
      </div>
    </div>
  );
}

function QueryTablesResults({
  action,
  owner,
}: {
  action: TablesQueryActionType;
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();
  const { output } = action;
  const title = getTablesQueryResultsFileTitle({ output });

  const handleDownload = useCallback(() => {
    if (action.resultsFileId) {
      try {
        const downloadUrl = `/api/w/${owner.sId}/files/${action.resultsFileId}?action=download`;
        // Open the download URL in a new tab/window. Otherwise we get a CORS error due to the redirection
        // to cloud storage.
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
  }, [action.resultsFileId, sendNotification, owner.sId]);

  if (!action.resultsFileId!) {
    if (typeof output?.error === "string") {
      return (
        <div>
          <span className="pb-2 text-sm font-semibold text-foreground dark:text-foreground-night">
            Error
          </span>
          <div className="text-sm">{output.error}</div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="flex flex-col">
      <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
        Results
      </span>
      <div>
        <Citation
          className="w-48 min-w-48 max-w-48"
          containerClassName="my-2"
          onClick={handleDownload}
          tooltip={title}
        >
          <CitationIcons>
            <Icon visual={TableIcon} />
          </CitationIcons>
          <CitationTitle>{title}</CitationTitle>
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
              className="language-csv max-h-60 overflow-y-auto"
              wrapLongLines={true}
            >
              {action.resultsFileSnippet}
            </CodeBlock>
          </div>
        }
      />
    </div>
  );
}
