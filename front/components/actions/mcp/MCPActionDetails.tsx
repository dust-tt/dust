import {
  Citation,
  CitationIcons,
  CitationTitle,
  cn,
  CodeBlock,
  CollapsibleComponent,
  ContentBlockWrapper,
  ContentMessage,
  Icon,
  InformationCircleIcon,
  MagnifyingGlassIcon,
  Markdown,
  PaginatedCitationsGrid,
  TableIcon,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useCallback } from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import { getDocumentIcon } from "@app/components/actions/retrieval/utils";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";
import type {
  SearchResultResourceType,
  SqlQueryOutputType,
  ThinkingOutputType,
  ToolGeneratedFileType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  isSearchQueryResourceType,
  isSearchResultResourceType,
  isSqlQueryOutput,
  isThinkingOutput,
  isToolGeneratedFile,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { ACTION_SPECIFICATIONS } from "@app/lib/actions/utils";
import type { LightWorkspaceType } from "@app/types";
import { isSupportedImageContentType } from "@app/types";

export function MCPActionDetails(
  props: ActionDetailsComponentBaseProps<MCPActionType>
) {
  const searchResults =
    props.action.output
      ?.filter(isSearchResultResourceType)
      .map((o) => o.resource) ?? [];
  // TODO(mcp): rationalize the display of results for MCP to remove the need for specific checks.
  const isTablesQuery = props.action.output?.some(isSqlQueryOutput);

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
  const queryResources =
    action.output?.filter(isSearchQueryResourceType).map((o) => o.resource) ??
    [];

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

interface ThinkingBlockProps {
  resource: ThinkingOutputType;
}

function ThinkingBlock({ resource }: ThinkingBlockProps) {
  return (
    <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
      <ContentMessage
        title="Reasoning" // TODO(mcp): to be challenged by the design team (could be "Thoughts")
        variant="primary"
        icon={InformationCircleIcon}
        size="lg"
      >
        <Markdown
          content={resource.text}
          isStreaming={false}
          forcedTextSize="text-sm"
          textColor="text-muted-foreground"
          isLastMessage={false}
        />
      </ContentMessage>
    </div>
  );
}

interface SqlQueryBlockProps {
  resource: SqlQueryOutputType;
}

function SqlQueryBlock({ resource }: SqlQueryBlockProps) {
  return (
    <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
      <ContentBlockWrapper content={resource.text}>
        <CodeBlock
          className="language-sql max-h-60 overflow-y-auto"
          wrapLongLines={true}
        >
          {resource.text}
        </CodeBlock>
      </ContentBlockWrapper>
    </div>
  );
}

interface ToolGeneratedFileDetailsProps {
  resource: ToolGeneratedFileType;
  icon: React.ComponentType<{ className?: string }>;
  owner: LightWorkspaceType;
}

function ToolGeneratedFileDetails({
  resource,
  icon,
  owner,
}: ToolGeneratedFileDetailsProps) {
  const sendNotification = useSendNotification();

  const handleDownload = useCallback(() => {
    try {
      const downloadUrl = `/api/w/${owner.sId}/files/${resource.fileId}?action=download`;
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
  }, [resource.fileId, sendNotification, owner.sId]);

  return (
    <>
      <div>
        <Citation
          className="w-48 min-w-48 max-w-48"
          containerClassName="my-2"
          onClick={handleDownload}
          tooltip={resource.title}
        >
          <CitationIcons>
            <Icon visual={icon} />
          </CitationIcons>
          <CitationTitle>{resource.title}</CitationTitle>
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
              {resource.snippet}
            </CodeBlock>
          </div>
        }
      />
    </>
  );
}

function TablesQueryActionDetails({
  action,
  defaultOpen,
  owner,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  const { output } = action;
  const thinkingBlocks =
    output?.filter(isThinkingOutput).map((o) => o.resource) ?? [];

  const sqlQueryBlocks =
    output?.filter(isSqlQueryOutput).map((o) => o.resource) ?? [];

  const generatedFiles =
    output?.filter(isToolGeneratedFile).map((o) => o.resource) ?? [];

  return (
    <ActionDetailsWrapper
      actionName="Query tables"
      defaultOpen={defaultOpen}
      visual={TableIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
            Reasoning
          </span>
          {thinkingBlocks.map((block) => (
            <ThinkingBlock key={block.text} resource={block} />
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
            Query
          </span>
          {sqlQueryBlocks.map((block) => (
            <SqlQueryBlock key={block.text} resource={block} />
          ))}
        </div>

        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
            Results
          </span>
          {generatedFiles.map((file) => (
            <ToolGeneratedFileDetails
              key={file.fileId}
              resource={file}
              icon={TableIcon}
              owner={owner}
            />
          ))}
        </div>
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
