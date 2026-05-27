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
import { useConversationMessages } from "@app/hooks/conversations/useConversationMessages";
import { useChildAgentStream } from "@app/hooks/useChildAgentStream";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { AGENT_CONFIGURATION_URI_PATTERN } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ToolGeneratedFileType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  isAgentPauseOutputResourceType,
  isRunAgentProgressOutput,
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

  // Derive query and childAgentId from toolOutput or lastNotification, falling
  // back to toolParams so the panel renders immediately without waiting for a
  // notification (fixes blank panel when the side panel is opened mid-run).
  const notificationQueryResource = useMemo(() => {
    const output = lastNotification?._meta.data.output;
    if (!output || !isStoreResourceProgressOutput(output)) {
      return null;
    }
    return output.contents.find(isRunAgentQueryResourceType) ?? null;
  }, [lastNotification]);

  const resolvedQueryResource = useMemo(
    () => queryResource ?? notificationQueryResource,
    [queryResource, notificationQueryResource]
  );

  const query = useMemo<string | null>(() => {
    if (resolvedQueryResource) {
      return resolvedQueryResource.resource.text;
    }
    const raw = toolParams["query"];
    return typeof raw === "string" ? raw : null;
  }, [resolvedQueryResource, toolParams]);

  const childAgentId = useMemo<string | null>(() => {
    if (resolvedQueryResource?.resource.childAgentId) {
      return resolvedQueryResource.resource.childAgentId;
    }
    const childAgentParam = toolParams["childAgent"];
    if (
      typeof childAgentParam === "object" &&
      childAgentParam !== null &&
      "uri" in childAgentParam
    ) {
      const { uri } = childAgentParam as { uri: unknown };
      if (typeof uri === "string") {
        const match = AGENT_CONFIGURATION_URI_PATTERN.exec(uri);
        return match?.[2] ?? null;
      }
    }
    return null;
  }, [resolvedQueryResource, toolParams]);

  // Stream connection IDs are only available via runtime notifications.
  // Initialize from lastNotification so the condition is already non-null on the first render
  // when the panel opens after RunAgentQueryProgressOutput has already fired, avoiding an
  // unnecessary fallback fetch in the normal case.
  const [childStreamIds, setChildStreamIds] = useState<{
    conversationId: string;
    agentMessageId: string;
  } | null>(() => {
    const output = lastNotification?._meta.data.output;
    if (
      output &&
      isRunAgentQueryProgressOutput(output) &&
      output.agentMessageId
    ) {
      return {
        conversationId: output.conversationId,
        agentMessageId: output.agentMessageId,
      };
    }
    return null;
  });

  useEffect(() => {
    if (childStreamIds !== null) {
      return;
    }
    const output = lastNotification?._meta.data.output;
    if (!output) {
      return;
    }
    if (isRunAgentQueryProgressOutput(output) && output.agentMessageId) {
      setChildStreamIds({
        conversationId: output.conversationId,
        agentMessageId: output.agentMessageId,
      });
    }
  }, [lastNotification, childStreamIds]);

  // conversationId is present in all run_agent notification types and in the result resource.
  const conversationId = useMemo<string | null>(() => {
    const output = lastNotification?._meta.data.output;
    if (output && isRunAgentProgressOutput(output)) {
      return output.conversationId;
    }
    return resultResource?.resource.conversationId ?? null;
  }, [lastNotification, resultResource]);

  // Fallback: if the panel was opened after the initial notification fired (late open, second tab),
  // childStreamIds is still null. Fetch the child conversation's latest agent message to recover it.
  const { messages: childConversationPages } = useConversationMessages({
    conversationId:
      childStreamIds === null &&
      resultResource === null &&
      displayContext !== "conversation"
        ? conversationId
        : null,
    workspaceId: owner.sId,
    limit: 5,
  });

  useEffect(() => {
    if (childStreamIds !== null || conversationId === null) {
      return;
    }
    // Reverse pages so the newest page (highest-ranked messages) comes first, ensuring we
    // find the latest agent_message and not an older retry.
    const agentMessage = [...childConversationPages]
      .reverse()
      .flatMap((page) => page.messages)
      .find((m) => m.type === "agent_message");
    if (agentMessage) {
      setChildStreamIds({ conversationId, agentMessageId: agentMessage.sId });
    }
  }, [childConversationPages, conversationId, childStreamIds]);

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
                      <CitationsContext.Provider value={citationsContextValue}>
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
