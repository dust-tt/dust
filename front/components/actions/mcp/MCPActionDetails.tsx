import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import {
  cn,
  CodeBlock,
  CollapsibleComponent,
  ContentBlockWrapper,
  ContentMessage,
  InformationCircleIcon,
  MagnifyingGlassIcon,
  Markdown,
  PaginatedCitationsGrid,
  TableIcon,
} from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import { getDocumentIcon } from "@app/components/actions/retrieval/utils";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";
import type {
  SearchResultResourceType,
  SqlQueryOutput,
  ThinkingOutput,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  isSearchResultResourceType,
  isSqlQueryOutput,
  isThinkingOutput,
  SearchQueryResourceSchema,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { ACTION_SPECIFICATIONS } from "@app/lib/actions/utils";
import { isSupportedImageContentType, removeNulls } from "@app/types";

export function MCPActionDetails(
  props: ActionDetailsComponentBaseProps<MCPActionType>
) {
  const searchResults = removeNulls(
    props.action.output?.map((o) => {
      if (o.type === "resource" && isSearchResultResourceType(o.resource)) {
        return o.resource;
      }
      return null;
    }) ?? []
  );
  // TODO(mcp): rationalize the display of results for MCP to remove the need for specific checks.
  const isTablesQuery = props.action.output?.some(
    (o) => o.type === "resource" && isSqlQueryOutput(o.resource)
  );

  if (searchResults.length > 0) {
    return (
      <SearchResultActionDetails {...props} searchResults={searchResults} />
    );
  } else if (isTablesQuery) {
    return <TablesQueryActionDetails {...props} />;
  } else {
    return <GenericActionDetails {...props} />;
  }
}

function SearchResultActionDetails({
  action,
  searchResults,
  defaultOpen,
}: ActionDetailsComponentBaseProps<MCPActionType> & {
  searchResults: SearchResultResourceType[];
}) {
  const queryResources = removeNulls(
    action.output?.map((o) => {
      if (
        o.type === "resource" &&
        o.resource.mimeType ===
          INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_QUERY
      ) {
        return SearchQueryResourceSchema.safeParse(o.resource).data;
      }
      return null;
    }) ?? []
  );

  return (
    <ActionDetailsWrapper
      actionName={"Search data"}
      defaultOpen={defaultOpen}
      visual={MagnifyingGlassIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-foreground dark:text-foreground-night">
            Query
          </span>
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            {queryResources.length > 0
              ? queryResources.map((r) => r.text).join("\n")
              : JSON.stringify(action.params, undefined, 2)}
          </div>
        </div>
        <div>
          <CollapsibleComponent
            rootProps={{ defaultOpen }}
            triggerChildren={
              <span className="text-sm font-bold text-foreground dark:text-foreground-night">
                Results
              </span>
            }
            contentChildren={
              <PaginatedCitationsGrid
                items={searchResults.map((r) => ({
                  description: "",
                  title: r.text,
                  icon: getDocumentIcon(r.source.provider),
                  href: r.uri,
                }))}
              />
            }
          />
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}

function ThinkingBlocks({ action }: { action: MCPActionType }) {
  const { output } = action;
  const thinkingBlocksContent =
    output
      ?.filter(
        (o): o is { type: "resource"; resource: ThinkingOutput } =>
          o.type === "resource" && isThinkingOutput(o.resource)
      )
      .map((o) => o.resource) ?? [];

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
        Reasoning
      </span>
      <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
        <ContentMessage
          title="Reasoning"
          variant="primary"
          icon={InformationCircleIcon}
          size="lg"
        >
          {thinkingBlocksContent.map((o, i) => (
            <Markdown
              content={o.text}
              isStreaming={false}
              forcedTextSize="text-sm"
              textColor="text-muted-foreground"
              isLastMessage={false}
              key={`thinking-block-${i}`}
            />
          ))}
        </ContentMessage>
      </div>
    </div>
  );
}

function SqlQueryBlocks({ action }: { action: MCPActionType }) {
  const { output } = action;
  const sqlQueryBlocksContent =
    output
      ?.filter(
        (o): o is { type: "resource"; resource: SqlQueryOutput } =>
          o.type === "resource" && isSqlQueryOutput(o.resource)
      )
      .map((o) => o.resource) ?? [];

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
        Query
      </span>
      <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
        {sqlQueryBlocksContent.map((o, i) => (
          <ContentBlockWrapper content={o.text} key={`sql-query-block-${i}`}>
            <CodeBlock
              className="language-sql max-h-60 overflow-y-auto"
              wrapLongLines={true}
            >
              {o.text}
            </CodeBlock>
          </ContentBlockWrapper>
        ))}
      </div>
    </div>
  );
}

function TablesQueryActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  return (
    <ActionDetailsWrapper
      actionName="Query tables"
      defaultOpen={defaultOpen}
      visual={TableIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <ThinkingBlocks action={action} />
        <SqlQueryBlocks action={action} />
      </div>
    </ActionDetailsWrapper>
  );
}

export function GenericActionDetails({
  owner,
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  return (
    <ActionDetailsWrapper
      actionName={action.functionCallName ?? "Calling MCP Server"}
      defaultOpen={defaultOpen}
      visual={ACTION_SPECIFICATIONS["MCP"].cardIcon}
    >
      <div className="flex flex-col gap-4 py-4 pl-6">
        <CollapsibleComponent
          rootProps={{ defaultOpen: !action.generatedFiles.length }}
          triggerChildren={
            <div
              className={cn(
                "text-foreground dark:text-foreground-night",
                "flex flex-row items-center gap-x-2"
              )}
            >
              <span className="heading-base">Inputs</span>
            </div>
          }
          contentChildren={
            <CodeBlock wrapLongLines className="language-json">
              {JSON.stringify(action.params, undefined, 2) ?? ""}
            </CodeBlock>
          }
        />

        {action.output && (
          <CollapsibleComponent
            rootProps={{ defaultOpen: !action.generatedFiles.length }}
            triggerChildren={
              <div
                className={cn(
                  "text-foreground dark:text-foreground-night",
                  "flex flex-row items-center gap-x-2"
                )}
              >
                <span className="heading-base">Output</span>
              </div>
            }
            contentChildren={
              <CodeBlock wrapLongLines>
                {action.output
                  // @ts-expect-error TODO(mcp): fixing typing resulting to unknown type
                  .filter((o) => o.text || o.resource.text)
                  // @ts-expect-error TODO(mcp): fixing typing resulting to unknown type
                  .map((o) => o.text || o.resource.text)
                  .join("\n")}
              </CodeBlock>
            }
          />
        )}

        {action.generatedFiles.length > 0 && (
          <>
            <span className="heading-base">Generated Files</span>
            <div className="flex flex-col gap-1">
              {action.generatedFiles.map((file) => {
                if (isSupportedImageContentType(file.contentType)) {
                  return (
                    <div key={file.fileId} className="mr-5">
                      <img
                        className="rounded-xl"
                        src={`/api/w/${owner.sId}/files/${file.fileId}`}
                        alt={`${file.title}`}
                      />
                    </div>
                  );
                }
                return (
                  <div key={file.fileId}>
                    <a
                      href={`/api/w/${owner.sId}/files/${file.fileId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {file.title}
                    </a>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </ActionDetailsWrapper>
  );
}
