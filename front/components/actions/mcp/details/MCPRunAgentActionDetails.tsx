import {
  Avatar,
  Button,
  Citation,
  CitationGrid,
  CitationIcons,
  CitationIndex,
  CitationTitle,
  ContentMessage,
  DocumentIcon,
  Markdown,
  RobotIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { ExternalLinkIcon } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/components/actions/mcp/details/MCPActionDetails";
import { ToolGeneratedFileDetails } from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import {
  CitationsContext,
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import type { MarkdownCitation } from "@app/components/markdown/MarkdownCitation";
import { getCitationIcon } from "@app/components/markdown/MarkdownCitation";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import {
  isRunAgentProgressOutput,
  isRunAgentQueriesResourceType,
  isRunAgentResultsResourceType,
  isToolGeneratedFile,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { useAgentConfiguration } from "@app/lib/swr/assistants";

// Separate component for each query result to properly handle hooks
function QueryResult({
  queryData,
  index,
  totalQueries,
  isDark,
}: {
  queryData: any;
  index: number;
  totalQueries: number;
  isDark: boolean;
}) {
  const isStreamingChainOfThought =
    queryData.isStreaming &&
    queryData.chainOfThought !== null &&
    queryData.response === null;
  const isStreamingResponse =
    queryData.isStreaming && queryData.response !== null;

  // Extract references for this specific query
  const references = useMemo(() => {
    if (!queryData.refs || Object.keys(queryData.refs).length === 0) {
      return {};
    }
    const markdownCitations: { [key: string]: MarkdownCitation } = {};
    Object.entries(queryData.refs).forEach(([key, citation]: [string, any]) => {
      const IconComponent = getCitationIcon(citation.provider, isDark);
      markdownCitations[key] = {
        title: citation.title,
        href: citation.href,
        description: citation.description,
        icon: <IconComponent />,
      };
    });
    return markdownCitations;
  }, [queryData.refs, isDark]);

  // Create local active references for this query
  const [localActiveReferences, setLocalActiveReferences] = useState<
    { index: number; document: MarkdownCitation }[]
  >([]);

  const updateLocalActiveReferences = (
    doc: MarkdownCitation,
    index: number
  ) => {
    const existingIndex = localActiveReferences.find((r) => r.index === index);
    if (!existingIndex) {
      setLocalActiveReferences([
        ...localActiveReferences,
        { index, document: doc },
      ]);
    }
  };

  const additionalMarkdownPlugins: PluggableList = useMemo(
    () => [getCiteDirective()],
    []
  );

  const additionalMarkdownComponents: Components = useMemo(
    () => ({
      sup: CiteBlock,
    }),
    []
  );

  return (
    <div className="flex flex-col gap-4">
      {totalQueries > 1 && (
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span>
            Query {index + 1} of {totalQueries}
          </span>
          {queryData.status === "pending" && (
            <span className="text-xs text-muted-foreground">(Pending)</span>
          )}
          {queryData.status === "running" && (
            <span className="text-xs text-blue-600">(Running)</span>
          )}
          {queryData.status === "completed" && (
            <span className="text-xs text-green-600">✓</span>
          )}
          {queryData.status === "failed" && (
            <span className="text-xs text-red-600">✗</span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {queryData.query && (
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            <ContentMessage title="Query" variant="primary" size="lg">
              <Markdown
                content={queryData.query}
                isStreaming={false}
                forcedTextSize="text-sm"
                textColor="text-muted-foreground"
                isLastMessage={false}
              />
            </ContentMessage>
          </div>
        )}

        {queryData.error && (
          <div className="text-sm font-normal text-red-600">
            <ContentMessage title="Error" variant="primary" size="lg">
              <div className="text-sm">{queryData.error}</div>
            </ContentMessage>
          </div>
        )}

        {/* Show loading state when query is running but no response yet */}
        {queryData.status === "running" &&
          !queryData.chainOfThought &&
          !queryData.response &&
          !queryData.error && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner size="xs" variant="color" />
              <span>Agent is processing...</span>
            </div>
          )}

        {/* Show pending state */}
        {queryData.status === "pending" && (
          <div className="text-sm text-muted-foreground opacity-60">
            <span>Waiting to start...</span>
          </div>
        )}

        {queryData.chainOfThought && !queryData.error && (
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            <ContentMessage title="Agent thoughts" variant="primary" size="lg">
              <Markdown
                content={queryData.chainOfThought}
                isStreaming={isStreamingChainOfThought}
                forcedTextSize="text-sm"
                textColor="text-muted-foreground"
                isLastMessage={false}
              />
            </ContentMessage>
          </div>
        )}

        {queryData.response && !queryData.error && (
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            <ContentMessage title="Response" variant="primary" size="lg">
              <CitationsContext.Provider
                value={{
                  references,
                  updateActiveReferences: updateLocalActiveReferences,
                }}
              >
                <Markdown
                  content={queryData.response}
                  isStreaming={isStreamingResponse}
                  forcedTextSize="text-sm"
                  textColor="text-muted-foreground"
                  isLastMessage={false}
                  additionalMarkdownPlugins={additionalMarkdownPlugins}
                  additionalMarkdownComponents={additionalMarkdownComponents}
                />
              </CitationsContext.Provider>

              {localActiveReferences.length > 0 && (
                <div className="mt-4">
                  <CitationGrid variant="grid">
                    {localActiveReferences
                      .sort((a, b) => a.index - b.index)
                      .map(({ document, index }) => (
                        <Citation
                          key={index}
                          onClick={
                            document.href
                              ? () => window.open(document.href, "_blank")
                              : undefined
                          }
                          tooltip={document.description || document.title}
                        >
                          <CitationIcons>
                            <CitationIndex>{index}</CitationIndex>
                            {document.icon}
                          </CitationIcons>
                          <CitationTitle>{document.title}</CitationTitle>
                        </Citation>
                      ))}
                  </CitationGrid>
                </div>
              )}
            </ContentMessage>
          </div>
        )}
      </div>

      <div>
        {queryData.conversationUrl && (
          <Button
            icon={ExternalLinkIcon}
            label={
              queryData.status === "completed"
                ? "View full conversation"
                : "View conversation in progress"
            }
            variant="outline"
            onClick={() => window.open(queryData.conversationUrl, "_blank")}
            size="xs"
            className="!p-1"
          />
        )}
      </div>
    </div>
  );
}

export function MCPRunAgentActionDetails({
  owner,
  action,
  lastNotification,
  defaultOpen,
}: MCPActionDetailsProps) {
  const { isDark } = useTheme();

  const queryResource =
    action.output?.find(isRunAgentQueriesResourceType) || null;
  const resultResource =
    action.output?.find(isRunAgentResultsResourceType) || null;
  const progressInfo = useMemo(() => {
    if (
      lastNotification?.data.output &&
      isRunAgentProgressOutput(lastNotification.data.output)
    ) {
      return lastNotification.data.output;
    }
    return null;
  }, [lastNotification]);

  const generatedFiles =
    action.output?.filter(isToolGeneratedFile).map((o) => o.resource) ?? [];

  // Get child agent ID
  const childAgentId = useMemo(() => {
    if (queryResource) {
      const resource = queryResource.resource as any;
      if (resource && "childAgentId" in resource) {
        return resource.childAgentId;
      }
    }
    if (progressInfo) {
      return progressInfo.childAgentId;
    }
    return null;
  }, [queryResource, progressInfo]);

  // Prepare data array from resources
  const queryDataArray = useMemo(() => {
    const queryRes = queryResource?.resource as any;
    const resultRes = resultResource?.resource as any;
    const queries =
      queryRes && "queries" in queryRes
        ? queryRes.queries || []
        : [];
    const results =
      resultRes && "results" in resultRes
        ? resultRes.results || []
        : [];
    const progressQueries = progressInfo?.activeQueries || [];

    // If we have progress queries but no query resource yet (during execution), use progress queries
    const allQueries =
      queries.length > 0 ? queries : progressQueries.map((pq) => pq.query);

    // Merge data from all sources
    return allQueries.map((query: string, index: number) => {
      const result = results[index];
      const progressQuery = progressQueries[index];

      return {
        query,
        response: result?.text || progressQuery?.text || null,
        chainOfThought:
          result?.chainOfThought || progressQuery?.chainOfThought || null,
        conversationId:
          result?.conversationId || progressQuery?.conversationId || null,
        conversationUrl:
          result?.uri ||
          progressQuery?.uri ||
          (progressQuery?.conversationId && progressQuery.conversationId !== ""
            ? `${window.location.origin}/w/${owner.sId}/assistant/${progressQuery.conversationId}`
            : null),
        isStreaming: progressQuery?.status === "running",
        error: result?.error || progressQuery?.error || null,
        status: progressQuery?.status || (result ? "completed" : "pending"),
        refs: result?.refs || {},
      };
    });
  }, [queryResource, resultResource, progressInfo, owner.sId]);

  const { agentConfiguration: childAgent } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: childAgentId,
  });

  const isBusy = useMemo(() => {
    return !resultResource;
  }, [resultResource]);

  const actionName = childAgent?.name
    ? `Run @${childAgent.name}${queryDataArray.length > 1 ? ` (${queryDataArray.length} queries)` : ""}`
    : "Run Agent";

  return (
    <ActionDetailsWrapper
      actionName={actionName}
      defaultOpen={defaultOpen}
      visual={
        childAgent?.pictureUrl
          ? () => (
              <Avatar visual={childAgent.pictureUrl} size="sm" busy={isBusy} />
            )
          : RobotIcon
      }
    >
      <div className="flex flex-col gap-6 pl-6 pt-4">
        {queryDataArray.map((queryData: any, index: number) => (
          <div key={index} className="flex flex-col gap-4">
            <QueryResult
              queryData={queryData}
              index={index}
              totalQueries={queryDataArray.length}
              isDark={isDark}
            />
            {queryDataArray.length > 1 && index < queryDataArray.length - 1 && (
              <div className="border-structure-200 border-b" />
            )}
          </div>
        ))}
        {generatedFiles.length > 0 && (
          <div className="flex flex-col gap-2">
            {generatedFiles.map((file) => (
              <ToolGeneratedFileDetails
                key={file.fileId}
                resource={file}
                icon={DocumentIcon}
                owner={owner}
              />
            ))}
          </div>
        )}
      </div>
    </ActionDetailsWrapper>
  );
}
