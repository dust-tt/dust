import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import { ChildAgentActivityTimeline } from "@app/components/actions/mcp/details/ChildAgentActivityTimeline";
import { ToolGeneratedFileDetails } from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import type {
  ActionDetailsDisplayContext,
  ToolExecutionDetailsProps,
} from "@app/components/actions/mcp/details/types";
import { AttachmentCitation } from "@app/components/assistant/conversation/attachment/AttachmentCitation";
import { markdownCitationToAttachmentCitation } from "@app/components/assistant/conversation/attachment/utils";
import type { PendingToolCall } from "@app/components/assistant/conversation/types";
import {
  CitationsContext,
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import type { MCPReferenceCitation } from "@app/components/markdown/MCPReferenceCitation";
import {
  getTaskDirectiveBlock,
  taskDirective,
} from "@app/components/markdown/TaskDirectiveBlock";
import { getIcon } from "@app/components/resources/resources_icons";
import { useChildAgentStream } from "@app/hooks/useChildAgentStream";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { ToolGeneratedFileType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  isAgentPauseOutputResourceType,
  isRunAgentQueryProgressOutput,
  isRunAgentQueryResourceType,
  isRunAgentResultResourceType,
  isStoreResourceProgressOutput,
  isToolGeneratedFile,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  agentMentionDirective,
  getAgentMentionPlugin,
} from "@app/lib/mentions/markdown/plugin";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useMCPServerViews } from "@app/lib/swr/mcp_servers";
import { useSpaces } from "@app/lib/swr/spaces";
import { emptyArray } from "@app/lib/swr/swr";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { InlineActivityStep } from "@app/types/assistant/conversation";
import type { AllSupportedWithDustSpecificFileContentType } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import {
  AttachmentChip,
  Avatar,
  Button,
  CitationGrid,
  ContentMessage,
  ExternalLinkIcon,
  Markdown,
  RobotIcon,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";
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
    toolOutput?.filter(isToolGeneratedFile).map((o) => o.resource) ?? [];

  const [query, setQuery] = useState<string | null>(null);
  const [childAgentId, setChildAgentId] = useState<string | null>(null);
  const [childStreamIds, setChildStreamIds] = useState<{
    conversationId: string;
    agentMessageId: string;
  } | null>(null);

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
      // Extract stream connection IDs from run_agent progress notification.
      if (isRunAgentQueryProgressOutput(output) && output.agentMessageId) {
        setChildStreamIds({
          conversationId: output.conversationId,
          agentMessageId: output.agentMessageId,
        });
      }
    }
  }, [queryResource, lastNotification]);

  // Subscribe to the child agent's event stream.
  const {
    response: streamingResponse,
    isStreamingResponse,
    inlineActivitySteps,
    pendingToolCalls,
    activeCotContent,
    isDone: isStreamDone,
    isError: isStreamError,
  } = useChildAgentStream({
    childStreamIds,
    owner,
    // We only stream when we are in the sidebar, in the conversation we only show the query.
    disabled: displayContext === "conversation",
  });

  const { agentConfiguration: childAgent } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: childAgentId,
  });

  const response = resultResource?.resource.text ?? streamingResponse;

  const conversationUrl = useMemo(() => {
    if (resultResource) {
      return resultResource.resource.uri;
    }
    if (childStreamIds) {
      return `/w/${owner.sId}/conversation/${childStreamIds.conversationId}`;
    }
    return null;
  }, [resultResource, childStreamIds, owner.sId]);

  const references = useMemo(() => {
    if (!resultResource?.resource.refs) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(resultResource.resource.refs).map(([ref, citation]) => [
        ref,
        {
          ref,
          provider: citation.provider,
          contentType:
            citation.contentType as AllSupportedWithDustSpecificFileContentType,
          title: citation.title,
          href: citation.href,
          description: citation.description,
        },
      ])
    ) satisfies Record<string, MCPReferenceCitation>;
  }, [resultResource]);

  if (!childAgent) {
    return null;
  }

  return (
    <MCPRunAgentActionDetailsDisplay
      displayContext={displayContext}
      owner={owner}
      query={query}
      childAgent={childAgent}
      isBusy={resultResource === null}
      isStreamingResponse={resultResource === null && isStreamingResponse}
      response={response}
      conversationUrl={conversationUrl}
      references={references}
      addedMCPServerViewIds={addedMCPServerViewIds}
      mcpServerViews={mcpServerViews}
      handoverResource={handoverResource}
      generatedFiles={generatedFiles}
      inlineActivitySteps={inlineActivitySteps}
      pendingToolCalls={pendingToolCalls}
      activeCotContent={activeCotContent}
      isStreamDone={isStreamDone || resultResource !== null}
      isStreamError={isStreamError}
    />
  );
}

interface MCPRunAgentActionDetailsDisplayProps {
  displayContext: ActionDetailsDisplayContext;
  owner: LightWorkspaceType;
  query: string | null;
  childAgent: AgentConfigurationType;
  isBusy: boolean;
  isStreamingResponse: boolean;
  response: string | null;
  conversationUrl: string | null;
  references: Record<string, MCPReferenceCitation>;
  addedMCPServerViewIds: string[];
  mcpServerViews: MCPServerViewType[];
  handoverResource: { resource: { text: string } } | null;
  generatedFiles: ToolGeneratedFileType[];
  inlineActivitySteps: InlineActivityStep[];
  pendingToolCalls: PendingToolCall[];
  activeCotContent: string;
  isStreamDone: boolean;
  isStreamError: boolean;
}

function MCPRunAgentActionDetailsDisplay({
  displayContext,
  owner,
  query,
  childAgent,
  isBusy,
  isStreamingResponse,
  response,
  conversationUrl,
  references,
  addedMCPServerViewIds,
  mcpServerViews,
  handoverResource,
  generatedFiles,
  inlineActivitySteps,
  pendingToolCalls,
  activeCotContent,
  isStreamDone,
  isStreamError,
}: MCPRunAgentActionDetailsDisplayProps) {
  const [activeReferences, setActiveReferences] = useState<
    { index: number; document: MCPReferenceCitation }[]
  >([]);

  const updateActiveReferences = useCallback(
    (doc: MCPReferenceCitation, index: number) => {
      setActiveReferences((prev) => {
        if (prev.find((r) => r.index === index)) {
          return prev;
        }
        return [...prev, { index, document: doc }];
      });
    },
    []
  );

  const citationsContextValue = useMemo(
    () => ({ references, updateActiveReferences }),
    [references, updateActiveReferences]
  );

  const additionalMarkdownPlugins: PluggableList = useMemo(
    () => [getCiteDirective(), agentMentionDirective, taskDirective],
    []
  );

  const additionalMarkdownComponents: Components = useMemo(
    () => ({
      sup: CiteBlock,
      // Warning: we can't rename easily `mention` to agent_mention, because the messages DB contains this name
      mention: getAgentMentionPlugin(owner),
      project_task: getTaskDirectiveBlock(owner),
    }),
    [owner]
  );

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
              <Avatar visual={childAgent.pictureUrl} size="xs" busy={isBusy} />
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
                    additionalMarkdownPlugins={additionalMarkdownPlugins}
                    additionalMarkdownComponents={additionalMarkdownComponents}
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
            {childAgent &&
              (inlineActivitySteps.length > 0 ||
                pendingToolCalls.length > 0 ||
                activeCotContent.length > 0 ||
                response) && (
                <>
                  <div className="flex items-center justify-between py-2">
                    <span className="font-medium text-foreground dark:text-foreground-night">
                      @{childAgent.name}'s Answer
                    </span>
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
                  <ChildAgentActivityTimeline
                    inlineActivitySteps={inlineActivitySteps}
                    pendingToolCalls={pendingToolCalls}
                    activeCotContent={activeCotContent}
                    isDone={isStreamDone}
                    isError={isStreamError}
                  />
                  {response && (
                    <>
                      <CitationsContext.Provider
                        value={citationsContextValue}
                      >
                        <Markdown
                          content={response}
                          isStreaming={isStreamingResponse}
                          isLastMessage={false}
                          additionalMarkdownPlugins={additionalMarkdownPlugins}
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
                    </>
                  )}
                </>
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
