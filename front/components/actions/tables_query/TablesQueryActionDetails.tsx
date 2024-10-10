import {
  Citation,
  Collapsible,
  ContentMessage,
  InformationCircleIcon,
  TableIcon,
} from "@dust-tt/sparkle";
import type { LightWorkspaceType, TablesQueryActionType } from "@dust-tt/types";
import { getTablesQueryResultsFileTitle } from "@dust-tt/types";
import { useCallback, useContext } from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import {
  CodeBlock,
  RenderMessageMarkdown,
} from "@app/components/assistant/RenderMessageMarkdown";
import { ContentBlockWrapper } from "@app/components/misc/ContentBlockWrapper";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";

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
      <span className="text-sm font-bold text-slate-900">Query</span>
      <div className="text-sm font-normal text-slate-500">
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
      <span className="text-sm font-bold text-slate-900">Reasoning</span>
      <div className="text-sm font-normal text-slate-500">
        <ContentMessage
          title="Reasoning"
          variant="purple"
          icon={InformationCircleIcon}
          size="lg"
        >
          <RenderMessageMarkdown
            content={thinking}
            isStreaming={false}
            textSize="sm"
            textColor="purple-800"
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
  const sendNotification = useContext(SendNotificationsContext);
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
          <span className="pb-2 text-sm font-bold text-slate-900">Error</span>
          <div className="text-sm">{output.error}</div>
        </div>
      );
    }
    return null;
  }

  return (
    <div>
      <span className="text-sm font-bold text-slate-900">Results</span>
      <div onClick={handleDownload} className="py-2">
        <Citation size="xs" title={title} />
      </div>

      <Collapsible defaultOpen={false}>
        <Collapsible.Button>
          <span className="text-sm font-bold text-slate-600">Preview</span>
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
