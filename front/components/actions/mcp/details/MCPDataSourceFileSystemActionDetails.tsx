import {
  ActionDocumentTextIcon,
  CodeBlock,
  CollapsibleComponent,
  ContentBlockWrapper,
  PaginatedCitationsGrid,
} from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import { getDocumentIcon } from "@app/components/actions/retrieval/utils";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";
import {
  isDataSourceNodeContentType,
  isDataSourceNodeListType, isSearchQueryResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";

export function MCPDataSourceFileSystemActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  const { output } = action;

  const searchQuery = output?.find(isSearchQueryResourceType)?.resource.text;

  const nodeResults =
    output?.filter(isDataSourceNodeListType).map((o) => o.resource) ?? [];

  const contentResults =
    output?.filter(isDataSourceNodeContentType).map((o) => o.resource) ?? [];

  const hasNodeResults = nodeResults.length > 0;
  const hasContentResults = contentResults.length > 0;

  return (
    <ActionDetailsWrapper
      actionName="Browse data sources"
      defaultOpen={defaultOpen}
      visual={ActionDocumentTextIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        {hasNodeResults && (
          <div>
            <CollapsibleComponent
              rootProps={{ defaultOpen: defaultOpen }}
              triggerChildren={
                <span className="text-sm font-bold text-foreground dark:text-foreground-night">
                  Files and Folders
                </span>
              }
              contentChildren={
                <div className="space-y-4">
                  {nodeResults.map((result, index) => (
                    <div key={index} className="space-y-2">
                      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                        {result.text}
                      </div>
                      <PaginatedCitationsGrid
                        items={result.data.map((node) => ({
                          description: `${node.path}${
                            node.lastUpdatedAt ? ` • ${node.lastUpdatedAt}` : ""
                          }`,
                          title: node.title,
                          icon: getDocumentIcon(
                            node.mimeType.includes("folder") ? "folder" : "file"
                          ),
                          href: node.sourceUrl || undefined,
                        }))}
                      />
                      {result.nextPageCursor && (
                        <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                          {result.resultCount} total results (showing page)
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              }
            />
          </div>
        )}

        {hasContentResults && (
          <div>
            <CollapsibleComponent
              rootProps={{ defaultOpen: defaultOpen }}
              triggerChildren={
                <span className="text-sm font-bold text-foreground dark:text-foreground-night">
                  File Content
                </span>
              }
              contentChildren={
                <div className="space-y-4">
                  {contentResults.map((result, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-foreground dark:text-foreground-night">
                          {result.metadata.title}
                        </div>
                        <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                          {result.metadata.lastUpdatedAt &&
                            ` • ${result.metadata.lastUpdatedAt}`}
                        </div>
                      </div>
                      <ContentBlockWrapper content={result.text}>
                        <CodeBlock
                          className="max-h-96 overflow-y-auto"
                          wrapLongLines={true}
                        >
                          {result.text}
                        </CodeBlock>
                      </ContentBlockWrapper>
                    </div>
                  ))}
                </div>
              }
            />
          </div>
        )}

        {!hasNodeResults && !hasContentResults && (
          <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            No results to display.
          </div>
        )}
      </div>
    </ActionDetailsWrapper>
  );
}
