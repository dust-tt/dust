import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import { ToolGeneratedFileDetails } from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { AttachmentCitation } from "@app/components/assistant/conversation/attachment/AttachmentCitation";
import { markdownCitationToAttachmentCitation } from "@app/components/assistant/conversation/attachment/utils";
import {
  CitationsContext,
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import type { MCPReferenceCitation } from "@app/components/markdown/MCPReferenceCitation";
import { getIcon } from "@app/components/resources/resources_icons";
import { useChildAgentStream } from "@app/hooks/useChildAgentStream";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import {
  isAgentPauseOutputResourceType,
  isRunAgentProgressOutput,
  isRunAgentQueryResourceType,
  isRunAgentResultResourceType,
  isStoreResourceProgressOutput,
  isToolGeneratedFile,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  agentMentionDirective,
  getAgentMentionPlugin,
} from "@app/lib/mentions/markdown/plugin";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useMCPServerViews } from "@app/lib/swr/mcp_servers";
import { useSpaces } from "@app/lib/swr/spaces";
import { emptyArray } from "@app/lib/swr/swr";
import type { AllSupportedWithDustSpecificFileContentType } from "@app/types/files";
import {
  AttachmentChip,
  Avatar,
  Button,
  CitationGrid,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessage,
  ExternalLinkIcon,
  Markdown,
  RobotIcon,
} from "@dust-tt/sparkle";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useEffect, useMemo, useState } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

export function MCPRunAgentActionDetails({
  lastNotification,
  owner,
  toolOutput,
  toolParams,
  displayContext,
}: ToolExecutionDetailsProps) {
  const addedMCPServerViewIds: string[] = useMemo(() => {
    if (!toolParams["toolsetsToAdd"]) {
      return emptyArray();
    }
    return toolParams["toolsetsToAdd"] as string[];
  }, [toolParams]);

  const { spaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global"],
    disabled: addedMCPServerViewIds.length === 0,
  });
  const { serverViews: mcpServerViews } = useMCPServerViews({
    owner,
    space: spaces[0] ?? undefined,
    availability: "all",
    disabled: addedMCPServerViewIds.length === 0,
  });

  const queryResource = toolOutput?.find(isRunAgentQueryResourceType) ?? null;
  const resultResource = toolOutput?.find(isRunAgentResultResourceType) ?? null;
  const handoverResource =
    toolOutput?.find(isAgentPauseOutputResourceType) ?? null;

  const generatedFiles =
    toolOutput
      ?.filter(isToolGeneratedFile)
      .map((o) => o.resource)
      .filter((r) => !r.hidden) ?? [];

  const [query, setQuery] = useState<string | null>(null);
  const [childAgentId, setChildAgentId] = useState<string | null>(null);
  const [childConversationId, setChildConversationId] = useState<string | null>(
    null
  );
  const [childAgentMessageId, setChildAgentMessageId] = useState<string | null>(
    null
  );

  // Extract query, childAgentId, conversationId, and agentMessageId from
  // notifications and tool output.
  useEffect(() => {
    if (queryResource) {
      setQuery(queryResource.resource.text);
      setChildAgentId(queryResource.resource.childAgentId);
    }
    if (lastNotification?._meta.data.output) {
      const output = lastNotification._meta.data.output;
      if (isStoreResourceProgressOutput(output)) {
        const runAgentQueryResource = output.contents.find(
          isRunAgentQueryResourceType
        );
        if (runAgentQueryResource) {
          setQuery(runAgentQueryResource.resource.text);
          setChildAgentId(runAgentQueryResource.resource.childAgentId);
        }
      }
      // Extract stream connection IDs from any run_agent progress notification
      // (run_agent, run_agent_chain_of_thought, or run_agent_generation_tokens).
      // This is needed after page refresh when the initial run_agent notification
      // has already been sent.
      if (isRunAgentProgressOutput(output)) {
        setChildConversationId(output.conversationId);
        setChildAgentMessageId(output.agentMessageId);
      }
    }
  }, [queryResource, lastNotification]);

  // Subscribe to the child agent's event stream.
  const childStream = useChildAgentStream({
    conversationId: childConversationId,
    agentMessageId: childAgentMessageId,
    owner,
  });

  const [activeReferences, setActiveReferences] = useState<
    { index: number; document: MCPReferenceCitation }[]
  >([]);

  const { agentConfiguration: childAgent } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: childAgentId,
  });

  // We are still streaming until we get a result.
  const isStreaming = !resultResource;

  const response: string = useMemo(() => {
    if (resultResource) {
      return resultResource.resource.text;
    }
    return childStream.content;
  }, [resultResource, childStream.content]);

  const chainOfThought: string = useMemo(() => {
    if (resultResource?.resource.chainOfThought) {
      return resultResource.resource.chainOfThought;
    }
    return childStream.chainOfThought;
  }, [resultResource, childStream.chainOfThought]);

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
    const mcpReferenceCitations: { [key: string]: MCPReferenceCitation } = {};
    Object.entries(resultResource.resource.refs).forEach(([key, citation]) => {
      mcpReferenceCitations[key] = {
        provider: citation.provider,
        contentType:
          citation.contentType as AllSupportedWithDustSpecificFileContentType,
        title: citation.title,
        href: citation.href,
        description: citation.description,
        fileId: key,
      };
    });
    return mcpReferenceCitations;
  }, [resultResource]);

  const updateActiveReferences = (doc: MCPReferenceCitation, index: number) => {
    const existingIndex = activeReferences.find((r) => r.index === index);
    if (!existingIndex) {
      setActiveReferences([...activeReferences, { index, document: doc }]);
    }
  };
  const additionalMarkdownPlugins: PluggableList = useMemo(
    () => [getCiteDirective(), agentMentionDirective],
    []
  );

  const additionalMarkdownComponents: Components = useMemo(
    () => ({
      sup: CiteBlock,
      // Warning: we can't rename easily `mention` to agent_mention, because the messages DB contains this name
      mention: getAgentMentionPlugin(owner),
    }),
    [owner]
  );

  if (!childAgent) {
    return null;
  }

  const agentName = childAgent.name;

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={
        displayContext === "conversation"
          ? `Running @${agentName}`
          : `Run @${agentName}`
      }
      visual={
        childAgent?.pictureUrl
          ? () => (
              <Avatar
                visual={childAgent.pictureUrl}
                size="xs"
                busy={isStreaming}
              />
            )
          : RobotIcon
      }
    >
      {displayContext === "conversation" ? (
        query && (
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            {query}
          </div>
        )
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
                        icon={{ visual: getIcon(mcpServerView.server.icon) }}
                        color="highlight"
                      />
                    );
                  })}
                </ContentMessage>
              </div>
            )}
            {handoverResource && (
              <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                <ContentMessage title="Handoff" variant="primary" size="lg">
                  <Markdown
                    content={handoverResource.resource.text}
                    additionalMarkdownPlugins={additionalMarkdownPlugins}
                    additionalMarkdownComponents={additionalMarkdownComponents}
                  />
                </ContentMessage>
              </div>
            )}
            {childAgent && (chainOfThought || response) && (
              <Collapsible defaultOpen={true}>
                <div className="flex items-center justify-between py-2">
                  <CollapsibleTrigger>
                    <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                      @{childAgent.name}'s Answer
                    </span>
                  </CollapsibleTrigger>
                  {conversationUrl && (
                    <Button
                      icon={ExternalLinkIcon}
                      label="View full conversation"
                      variant="outline"
                      onClick={() => window.open(conversationUrl, "_blank")}
                      size="xs"
                    />
                  )}
                </div>
                <CollapsibleContent>
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
                            isStreaming={isStreaming}
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
                              isStreaming={isStreaming}
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
                                    <AttachmentCitation
                                      key={index}
                                      attachmentCitation={markdownCitationToAttachmentCitation(
                                        document
                                      )}
                                      owner={owner}
                                      conversationId={null}
                                    />
                                  ))}
                              </CitationGrid>
                            </div>
                          )}
                        </ContentMessage>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
            {generatedFiles.length > 0 && (
              <div className="flex flex-col gap-2">
                {generatedFiles.map((file) => (
                  <ToolGeneratedFileDetails
                    key={file.fileId}
                    resource={file}
                    owner={owner}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </ActionDetailsWrapper>
  );
}
