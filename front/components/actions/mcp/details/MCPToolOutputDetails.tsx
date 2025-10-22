import {
  Chip,
  Citation,
  CitationIcons,
  CitationTitle,
  CodeBlock,
  CollapsibleComponent,
  ContentBlockWrapper,
  ContentMessage,
  FaviconIcon,
  Icon,
  InformationCircleIcon,
  Markdown,
  PaginatedCitationsGrid,
  Tooltip,
} from "@dust-tt/sparkle";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { useCallback } from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import { useSendNotification } from "@app/hooks/useNotification";
import type {
  ReasoningSuccessOutputType,
  SqlQueryOutputType,
  ThinkingOutputType,
  ToolGeneratedFileType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  isDataSourceNodeContentType,
  isDataSourceNodeListType,
  isIncludeResultResourceType,
  isSearchResultResourceType,
  isWarningResourceType,
  isWebsearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { getDocumentIcon } from "@app/lib/content_nodes";
import type { LightWorkspaceType } from "@app/types";
import { removeNulls } from "@app/types";

interface ThinkingBlockProps {
  resource: ThinkingOutputType;
}

export function ThinkingBlock({ resource }: ThinkingBlockProps) {
  return (
    resource.text && (
      <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
        <ContentMessage
          title="Reasoning"
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
    )
  );
}

interface ReasoningSuccessBlockProps {
  resource: ReasoningSuccessOutputType;
}

export function ReasoningSuccessBlock({
  resource,
}: ReasoningSuccessBlockProps) {
  return (
    resource.text && (
      <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
        <Markdown
          content={resource.text}
          textColor="text-muted-foreground dark:text-muted-foreground-night"
          isStreaming={false}
          forcedTextSize="md"
          isLastMessage={false}
        />
      </div>
    )
  );
}

interface SqlQueryBlockProps {
  resource: SqlQueryOutputType;
}

export function SqlQueryBlock({ resource }: SqlQueryBlockProps) {
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

export function ToolGeneratedFileDetails({
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
      {resource.snippet && (
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
      )}
    </>
  );
}

interface SearchResultProps {
  actionName: string;
  visual: React.ComponentType<{ className?: string }>;
  actionOutput: CallToolResult["content"] | null;
  viewType: "conversation" | "sidebar";
  query: string;
}

export function SearchResultDetails({
  actionName,
  visual,
  viewType,
  actionOutput,
  query,
}: SearchResultProps) {
  const warning = actionOutput
    ?.filter(isWarningResourceType)
    .map((o) => o.resource)?.[0];

  const singleFileContentText = actionOutput
    ?.filter(isDataSourceNodeContentType)
    .map((o) => o.resource.text)
    .join("\n");

  const citations = (() => {
    if (!actionOutput) {
      return [];
    }
    return removeNulls(
      actionOutput.flatMap((r) => {
        if (isWebsearchResultResourceType(r)) {
          return [
            {
              description: r.resource.text,
              title: r.resource.title,
              icon: <FaviconIcon websiteUrl={r.resource.uri} size="sm" />,
              href: r.resource.uri,
            },
          ];
        }
        if (isSearchResultResourceType(r) || isIncludeResultResourceType(r)) {
          const IconComponent = getDocumentIcon(r.resource.source.provider);
          return [
            {
              description: "",
              title: r.resource.text,
              icon: <IconComponent />,
              href: r.resource.uri,
            },
          ];
        }
        if (isDataSourceNodeListType(r)) {
          return r.resource.data.map((node) => {
            const IconComponent = getDocumentIcon(node.connectorProvider);
            return {
              description: `${node.path}${
                node.lastUpdatedAt ? ` • ${node.lastUpdatedAt}` : ""
              }`,
              title: node.title,
              icon: <IconComponent />,
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              href: node.sourceUrl || undefined,
            };
          });
        }
        if (isDataSourceNodeContentType(r)) {
          const { metadata } = r.resource;
          const IconComponent = getDocumentIcon(metadata.connectorProvider);
          return [
            {
              description: `${metadata.path}${
                metadata.lastUpdatedAt ? ` • ${metadata.lastUpdatedAt}` : ""
              }`,
              title: metadata.title,
              icon: <IconComponent />,
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              href: metadata.sourceUrl || undefined,
            },
          ];
        }
        return [null];
      })
    );
  })();

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={actionName}
      visual={visual}
    >
      {viewType === "conversation" ? (
        <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
          {query}
        </div>
      ) : (
        <div className="flex flex-col gap-4 pl-6 pt-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-bold text-foreground dark:text-foreground-night">
              Query
            </span>
            <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
              {query}
            </div>
            {warning && (
              <Tooltip
                label={warning.text}
                trigger={<Chip color="warning" label={warning.warningTitle} />}
              />
            )}
          </div>
          {actionOutput && viewType === "sidebar" && (
            <div>
              <CollapsibleComponent
                rootProps={{ defaultOpen: true }}
                triggerChildren={
                  <span className="text-sm font-bold text-foreground dark:text-foreground-night">
                    Results
                  </span>
                }
                contentChildren={
                  <>
                    {singleFileContentText && (
                      <Markdown
                        content={singleFileContentText}
                        isStreaming={false}
                        forcedTextSize="text-sm"
                        textColor="text-muted-foreground dark:text-muted-foreground-night"
                      />
                    )}
                    <PaginatedCitationsGrid items={citations} />
                  </>
                }
              />
            </div>
          )}
        </div>
      )}
    </ActionDetailsWrapper>
  );
}
