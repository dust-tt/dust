import {
  Citation,
  CitationIcons,
  CitationTitle,
  Collapsible,
  ContentMessage,
  Icon,
  InformationCircleIcon,
  TableIcon,
  useSendNotification,
} from "@dust-tt/sparkle";
import { CodeBlock } from "@dust-tt/sparkle";
import { ContentBlockWrapper } from "@dust-tt/sparkle";
import { Markdown } from "@dust-tt/sparkle";
import type { LightWorkspaceType, TablesQueryActionType } from "@dust-tt/types";
import { getTablesQueryResultsFileTitle } from "@dust-tt/types";
import { useCallback } from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";

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
      <div className="flex flex-col gap-1 gap-4 pl-6 pt-4">
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
      <span className="text-sm font-semibold text-foreground">Query</span>
      <div className="text-sm font-normal text-muted-foreground">
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
      <span className="text-sm font-semibold text-foreground">Reasoning</span>
      <div className="text-sm font-normal text-muted-foreground">
        <ContentMessage
          title="Reasoning"
          variant="purple"
          icon={InformationCircleIcon}
          size="lg"
        >
          <Markdown
            content={thinking}
            isStreaming={false}
            textSize="sm"
            textColor="purple-800"
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
          <span className="pb-2 text-sm font-semibold text-foreground">
            Error
          </span>
          <div className="text-sm">{output.error}</div>
        </div>
      );
    }
    return null;
  }

  return (
    <div>
      <span className="text-sm font-semibold text-foreground">Results</span>
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

      <Collapsible defaultOpen={false}>
        <Collapsible.Button>
          <span className="text-sm font-semibold text-muted-foreground">
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
  );
}
