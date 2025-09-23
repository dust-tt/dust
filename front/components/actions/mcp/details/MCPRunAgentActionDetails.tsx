import {
  AttachmentChip,
  Avatar,
  Button,
  Citation,
  CitationGrid,
  CitationIcons,
  CitationIndex,
  CitationTitle,
  CollapsibleComponent,
  ContentMessage,
  DocumentIcon,
  ExternalLinkIcon,
  Markdown,
  RobotIcon,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import { ToolGeneratedFileDetails } from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import {
  CitationsContext,
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import type { MarkdownCitation } from "@app/components/markdown/MarkdownCitation";
import { getCitationIcon } from "@app/components/markdown/MarkdownCitation";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getIcon } from "@app/lib/actions/mcp_icons";
import {
  isAgentPauseOutputResourceType,
  isRunAgentChainOfThoughtProgressOutput,
  isRunAgentGenerationTokensProgressOutput,
  isRunAgentQueryResourceType,
  isRunAgentResultResourceType,
  isStoreResourceProgressOutput,
  isToolGeneratedFile,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useMCPServerViews } from "@app/lib/swr/mcp_servers";
import { useSpaces } from "@app/lib/swr/spaces";
import { emptyArray } from "@app/lib/swr/swr";

export function MCPRunAgentActionDetails({
  lastNotification,
  owner,
  toolOutput,
  toolParams,
  viewType,
}: ToolExecutionDetailsProps) {
  const { isDark } = useTheme();

  const addedMCPServerViewIds: string[] = useMemo(() => {
    if (!toolParams["toolsetsToAdd"]) {
      return emptyArray();
    }
    return toolParams["toolsetsToAdd"] as string[];
  }, [toolParams]);

  const { spaces } = useSpaces({
    workspaceId: owner.sId,
    disabled: addedMCPServerViewIds.length === 0,
  });
  const { serverViews: mcpServerViews } = useMCPServerViews({
    owner,
    space: spaces.find((s) => s.kind === "global"),
    availability: "all",
    disabled: addedMCPServerViewIds.length === 0,
  });

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const queryResource = toolOutput?.find(isRunAgentQueryResourceType) || null;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const resultResource = toolOutput?.find(isRunAgentResultResourceType) || null;
  const handoverResource =
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    toolOutput?.find(isAgentPauseOutputResourceType) || null;

  const generatedFiles =
    toolOutput
      ?.filter(isToolGeneratedFile)
      .map((o) => o.resource)
      .filter((r) => !r.hidden) ?? [];

  const [query, setQuery] = useState<string | null>(null);
  const [childAgentId, setChildAgentId] = useState<string | null>(null);

  const [streamedChainOfThought, setStreamedChainOfThought] = useState<
    string | null
  >(null);
  const [streamedResponse, setStreamedResponse] = useState<string | null>(null);
  const [activeReferences, setActiveReferences] = useState<
    { index: number; document: MarkdownCitation }[]
  >([]);

  useEffect(() => {
    if (queryResource) {
      setQuery(queryResource.resource.text);
      setChildAgentId(queryResource.resource.childAgentId);
    }
    if (lastNotification?.data.output) {
      const output = lastNotification.data.output;
      if (isStoreResourceProgressOutput(output)) {
        const runAgentQueryResource = output.contents.find(
          isRunAgentQueryResourceType
        );
        if (runAgentQueryResource) {
          setQuery(runAgentQueryResource.resource.text);
          setChildAgentId(runAgentQueryResource.resource.childAgentId);
        }
      } else if (isRunAgentChainOfThoughtProgressOutput(output)) {
        setStreamedChainOfThought(output.chainOfThought);
      } else if (isRunAgentGenerationTokensProgressOutput(output)) {
        setStreamedResponse(output.text);
      }
    }
  }, [queryResource, lastNotification]);

  const response = useMemo(() => {
    if (resultResource) {
      return resultResource.resource.text;
    }
    return streamedResponse;
  }, [resultResource, streamedResponse]);

  const chainOfThought = useMemo(() => {
    if (resultResource && resultResource.resource.chainOfThought) {
      return resultResource.resource.chainOfThought;
    }
    return streamedChainOfThought;
  }, [resultResource, streamedChainOfThought]);

  const { agentConfiguration: childAgent } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: childAgentId,
  });

  const isBusy = useMemo(() => {
    if (resultResource) {
      return false;
    }
    return true;
  }, [resultResource]);

  const isStreamingChainOfThought = useMemo(() => {
    return isBusy && chainOfThought !== null && response === null;
  }, [isBusy, chainOfThought, response]);

  const isStreamingResponse = useMemo(() => {
    return isBusy && response !== null && !resultResource;
  }, [isBusy, response, resultResource]);

  const conversationUrl = useMemo(() => {
    if (resultResource) {
      return resultResource.resource.uri;
    }
    return null;
  }, [resultResource]);

  const references = useMemo(() => {
    if (!resultResource?.resource.refs) {
      return {};
    }
    const markdownCitations: { [key: string]: MarkdownCitation } = {};
    Object.entries(resultResource.resource.refs).forEach(([key, citation]) => {
      const IconComponent = getCitationIcon(
        citation.provider, 
        isDark, 
        undefined, 
        citation.href
      );
      markdownCitations[key] = {
        title: citation.title,
        href: citation.href,
        description: citation.description,
        icon: <IconComponent />,
      };
    });
    return markdownCitations;
  }, [resultResource, isDark]);

  const updateActiveReferences = (doc: MarkdownCitation, index: number) => {
    const existingIndex = activeReferences.find((r) => r.index === index);
    if (!existingIndex) {
      setActiveReferences([...activeReferences, { index, document: doc }]);
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

  if (!childAgent) {
    return null;
  }

  const agentName = childAgent.name;

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={
        viewType === "conversation"
          ? `Running @${agentName}`
          : `Run @${agentName}`
      }
      visual={
        childAgent?.pictureUrl
          ? () => (
              <Avatar visual={childAgent.pictureUrl} size="xs" busy={isBusy} />
            )
          : RobotIcon
      }
    >
      {viewType === "conversation" ? (
        <>
          {query && (
            <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
              {query}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-4 pl-6 pt-4">
          <div className="flex flex-col gap-4">
            {query && childAgent && (
              <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                <ContentMessage title="Query" variant="primary" size="lg">
                  <Markdown
                    content={query}
                    isStreaming={false}
                    forcedTextSize="text-sm"
                    textColor="text-muted-foreground"
                    isLastMessage={false}
                  />
                </ContentMessage>
              </div>
            )}

            {addedMCPServerViewIds.length > 0 && (
              <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                <ContentMessage title="Added Tools" variant="primary" size="lg">
                  {addedMCPServerViewIds.map((id) => {
                    const mcpServerView = mcpServerViews.find(
                      (v) => v.sId === id
                    );
                    if (!mcpServerView) {
                      return null;
                    }
                    return (
                      <AttachmentChip
                        key={id}
                        label={getMcpServerViewDisplayName(mcpServerView)}
                        icon={getIcon(mcpServerView.server.icon)}
                      />
                    );
                  })}
                </ContentMessage>
              </div>
            )}
            {handoverResource && (
              <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                <ContentMessage title="Handover" variant="primary" size="lg">
                  {handoverResource.resource.text}
                </ContentMessage>
              </div>
            )}
            {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
            {childAgent && (chainOfThought || response) && (
              <CollapsibleComponent
                rootProps={{ defaultOpen: true }}
                triggerChildren={
                  <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                    @{childAgent.name}'s Answer
                  </span>
                }
                contentChildren={
                  <div className="flex flex-col gap-4">
                    {chainOfThought && (
                      <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                        <ContentMessage
                          title="Agent thoughts"
                          variant="primary"
                          size="lg"
                        >
                          <Markdown
                            content={chainOfThought}
                            isStreaming={isStreamingChainOfThought}
                            forcedTextSize="text-sm"
                            textColor="text-muted-foreground"
                            isLastMessage={false}
                          />
                        </ContentMessage>
                      </div>
                    )}
                    {response && (
                      <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                        <ContentMessage
                          title="Response"
                          variant="primary"
                          size="lg"
                        >
                          <CitationsContext.Provider
                            value={{
                              references,
                              updateActiveReferences,
                            }}
                          >
                            <Markdown
                              content={response}
                              isStreaming={isStreamingResponse}
                              forcedTextSize="text-sm"
                              textColor="text-muted-foreground"
                              isLastMessage={false}
                              additionalMarkdownPlugins={
                                additionalMarkdownPlugins
                              }
                              additionalMarkdownComponents={
                                additionalMarkdownComponents
                              }
                            />
                          </CitationsContext.Provider>

                          {activeReferences.length > 0 && (
                            <div className="mt-4">
                              <CitationGrid variant="grid">
                                {activeReferences
                                  .sort((a, b) => a.index - b.index)
                                  .map(({ document, index }) => (
                                    <Citation
                                      key={index}
                                      onClick={
                                        document.href
                                          ? () =>
                                              window.open(
                                                document.href,
                                                "_blank"
                                              )
                                          : undefined
                                      }
                                      tooltip={
                                        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                                        document.description || document.title
                                      }
                                    >
                                      <CitationIcons>
                                        <CitationIndex>{index}</CitationIndex>
                                        {document.icon}
                                      </CitationIcons>
                                      <CitationTitle>
                                        {document.title}
                                      </CitationTitle>
                                    </Citation>
                                  ))}
                              </CitationGrid>
                            </div>
                          )}
                        </ContentMessage>
                      </div>
                    )}
                  </div>
                }
              />
            )}
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
          <div>
            {conversationUrl && (
              <Button
                icon={ExternalLinkIcon}
                label="View full conversation"
                variant="outline"
                onClick={() => window.open(conversationUrl, "_blank")}
                size="xs"
                className="!p-1"
              />
            )}
          </div>
        </div>
      )}
    </ActionDetailsWrapper>
  );
}
