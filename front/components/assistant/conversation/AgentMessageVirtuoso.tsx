import {
  ArrowPathIcon,
  AtomIcon,
  Button,
  Chip,
  ClipboardCheckIcon,
  ClipboardIcon,
  ConversationMessage,
  DocumentIcon,
  Icon,
  InteractiveImageGrid,
  Markdown,
  Separator,
  StopIcon,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import { marked } from "marked";
import React, { useCallback, useMemo } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

import { AgentMessageActions } from "@app/components/assistant/conversation/actions/AgentMessageActions";
import { AgentHandle } from "@app/components/assistant/conversation/AgentHandle";
import { AgentMessageCompletionStatus } from "@app/components/assistant/conversation/AgentMessageCompletionStatus";
import {
  AgentMessageInteractiveContentGeneratedFiles,
  DefaultAgentMessageGeneratedFiles,
} from "@app/components/assistant/conversation/AgentMessageGeneratedFiles";
import { useActionValidationContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { ErrorMessage } from "@app/components/assistant/conversation/ErrorMessage";
import type { FeedbackSelectorProps } from "@app/components/assistant/conversation/FeedbackSelector";
import { FeedbackSelector } from "@app/components/assistant/conversation/FeedbackSelector";
import { FeedbackSelectorPopoverContent } from "@app/components/assistant/conversation/FeedbackSelectorPopoverContent";
import { GenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import { useAutoOpenInteractiveContent } from "@app/components/assistant/conversation/interactive_content/useAutoOpenInteractiveContent";
import { MCPServerPersonalAuthenticationRequired } from "@app/components/assistant/conversation/MCPServerPersonalAuthenticationRequired";
import type {
  AgentMessageStateWithControlEvent,
  MessageTemporaryState,
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  getMessageSId,
  isMessageTemporayState,
} from "@app/components/assistant/conversation/types";
import {
  CitationsContext,
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import { getImgPlugin, imgDirective } from "@app/components/markdown/Image";
import type { MarkdownCitation } from "@app/components/markdown/MarkdownCitation";
import { getCitationIcon } from "@app/components/markdown/MarkdownCitation";
import {
  getMentionPlugin,
  mentionDirective,
} from "@app/components/markdown/MentionBlock";
import {
  getVisualizationPlugin,
  sanitizeVisualizationContent,
  visualizationDirective,
} from "@app/components/markdown/VisualizationBlock";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useAgentMessageStreamVirtuoso } from "@app/hooks/useAgentMessageStreamVirtuoso";
import { isImageProgressOutput } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { useCancelMessage } from "@app/lib/swr/conversations";
import { useConversationMessage } from "@app/lib/swr/conversations";
import { formatTimestring } from "@app/lib/utils/timestamps";
import type {
  LightAgentMessageType,
  LightAgentMessageWithActionsType,
  LightWorkspaceType,
  PersonalAuthenticationRequiredErrorContent,
  UserType,
  WorkspaceType,
} from "@app/types";
import {
  assertNever,
  GLOBAL_AGENTS_SID,
  isInteractiveContentFileContentType,
  isPersonalAuthenticationRequiredErrorContent,
  isSupportedImageContentType,
} from "@app/types";

interface AgentMessageProps {
  conversationId: string;
  isLastMessage: boolean;
  isAgentMessageHandover: boolean;
  messageStreamState: MessageTemporaryState;
  messageFeedback: FeedbackSelectorProps;
  owner: WorkspaceType;
  user: UserType;
}

export function AgentMessageVirtuoso({
  conversationId,
  isLastMessage,
  isAgentMessageHandover,
  messageStreamState,
  messageFeedback,
  owner,
}: AgentMessageProps) {
  const sId = getMessageSId(messageStreamState);
  const { isDark } = useTheme();

  const [isRetryHandlerProcessing, setIsRetryHandlerProcessing] =
    React.useState<boolean>(false);

  const [activeReferences, setActiveReferences] = React.useState<
    { index: number; document: MarkdownCitation }[]
  >([]);
  const [isCopied, copy] = useCopyToClipboard();

  const isGlobalAgent = Object.values(GLOBAL_AGENTS_SID).includes(
    messageStreamState.message.configuration.sId as GLOBAL_AGENTS_SID
  );

  const { showBlockedActionsDialog, enqueueBlockedAction } =
    useActionValidationContext();

  const { mutateMessage } = useConversationMessage({
    conversationId,
    workspaceId: owner.sId,
    messageId: sId,
    options: { disabled: true },
  });

  const { shouldStream } = useAgentMessageStreamVirtuoso({
    messageStreamState,
    conversationId,
    owner,
    mutateMessage,
    onEventCallback: useCallback(
      (eventPayload: {
        eventId: string;
        data: AgentMessageStateWithControlEvent;
      }) => {
        const eventType = eventPayload.data.type;

        if (eventType === "tool_approve_execution") {
          showBlockedActionsDialog();
          enqueueBlockedAction({
            messageId: sId,
            blockedAction: {
              status: "blocked_validation_required",
              authorizationInfo: null,
              messageId: eventPayload.data.messageId,
              conversationId: eventPayload.data.conversationId,
              actionId: eventPayload.data.actionId,
              inputs: eventPayload.data.inputs,
              stake: eventPayload.data.stake,
              metadata: eventPayload.data.metadata,
            },
          });
        }
      },
      [showBlockedActionsDialog, enqueueBlockedAction, sId]
    ),
    streamId: `message-${sId}`,
    useFullChainOfThought: false,
  });

  const agentMessageToRender = getAgentMessageToRender({
    message: messageStreamState.message,
    messageStreamState: messageStreamState,
  });
  const cancelMessage = useCancelMessage({ owner, conversationId });

  const references = useMemo(
    () =>
      Object.entries(agentMessageToRender.citations ?? {}).reduce<
        Record<string, MarkdownCitation>
      >((acc, [key, citation]) => {
        if (citation) {
          const IconComponent = getCitationIcon(
            citation.provider,
            isDark,
            citation.faviconUrl,
            citation.href
          );
          return {
            ...acc,
            [key]: {
              href: citation.href,
              title: citation.title,
              description: citation.description,
              icon: <IconComponent />,
            },
          };
        }
        return acc;
      }, {}),
    [agentMessageToRender.citations, isDark]
  );

  // GenerationContext: to know if we are generating or not.
  const generationContext = React.useContext(GenerationContext);
  if (!generationContext) {
    throw new Error(
      "AgentMessage must be used within a GenerationContextProvider"
    );
  }
  React.useEffect(() => {
    const isInArray = generationContext.generatingMessages.some(
      (m) => m.messageId === sId
    );
    if (agentMessageToRender.status === "created" && !isInArray) {
      generationContext.setGeneratingMessages((s) => [
        ...s,
        { messageId: sId, conversationId },
      ]);
    } else if (agentMessageToRender.status !== "created" && isInArray) {
      generationContext.setGeneratingMessages((s) =>
        s.filter((m) => m.messageId !== sId)
      );
    }
  }, [agentMessageToRender.status, generationContext, sId, conversationId]);

  const PopoverContent = useCallback(
    () => (
      <FeedbackSelectorPopoverContent
        owner={owner}
        agentMessageToRender={agentMessageToRender}
      />
    ),
    [owner, agentMessageToRender]
  );

  async function handleCopyToClipboard() {
    const messageContent = agentMessageToRender.content ?? "";
    let footnotesMarkdown = "";
    let footnotesHtml = "";

    // 1. Build Key-to-Index Map
    const keyToIndexMap = new Map<string, number>();
    if (references && activeReferences) {
      Object.entries(references).forEach(([key, mdCitation]) => {
        const activeRefEntry = activeReferences.find(
          (ar) =>
            ar.document.href === mdCitation.href &&
            ar.document.title === mdCitation.title
        );
        if (activeRefEntry) {
          keyToIndexMap.set(key, activeRefEntry.index);
        }
      });
    }

    // 2. Process Message Content for Plain Text numerical citations
    let processedMessageContent = messageContent;
    if (keyToIndexMap.size > 0) {
      const citeDirectiveRegex = /:cite\[([a-zA-Z0-9_,-]+)\]/g;
      processedMessageContent = messageContent.replace(
        citeDirectiveRegex,
        (_match, keysString: string) => {
          const keys = keysString.split(",").map((k) => k.trim());
          const resolvedIndices = keys
            .map((k) => keyToIndexMap.get(k))
            .filter((idx) => idx !== undefined) as number[];

          if (resolvedIndices.length > 0) {
            resolvedIndices.sort((a, b) => a - b);
            return `[${resolvedIndices.join(",")}]`;
          }
          return _match;
        }
      );
    }

    if (activeReferences.length > 0) {
      footnotesMarkdown = "\n\nReferences:\n";
      footnotesHtml = "<br/><br/><div>References:</div>";
      const sortedActiveReferences = [...activeReferences].sort(
        (a, b) => a.index - b.index
      );
      for (const ref of sortedActiveReferences) {
        footnotesMarkdown += `[${ref.index}] ${ref.document.href}\n`;
        footnotesHtml += `<div>[${ref.index}] <a href="${ref.document.href}">${ref.document.title}</a></div>`;
      }
    }

    const markdownText = processedMessageContent + footnotesMarkdown;
    const htmlContent = (await marked(processedMessageContent)) + footnotesHtml;

    await copy(
      new ClipboardItem({
        "text/plain": new Blob([markdownText], { type: "text/plain" }),
        "text/html": new Blob([htmlContent], { type: "text/html" }),
      })
    );
  }

  const buttons: React.ReactElement[] = [];

  const hasMultiAgents =
    generationContext.generatingMessages.filter(
      (m) => m.conversationId === conversationId
    ).length > 1;

  // Show stop agent button only when streaming with multiple agents
  // (it feels distractive to show buttons while streaming so we would like to avoid as much as possible.
  // However, when there are multiple agents there is no other way to stop only single agent so we need to show it here).
  if (hasMultiAgents && agentMessageToRender.status === "created") {
    buttons.push(
      <Button
        key="stop-msg-button"
        label="Stop agent"
        variant="ghost-secondary"
        size="xs"
        onClick={async () => {
          await cancelMessage([sId]);
        }}
        icon={StopIcon}
        className="text-muted-foreground"
      />
    );
  }

  // Show copy & feedback buttons only when streaming is done and it didn't fail
  if (
    agentMessageToRender.status !== "created" &&
    agentMessageToRender.status !== "failed"
  ) {
    buttons.push(
      <Button
        key="copy-msg-button"
        tooltip={isCopied ? "Copied!" : "Copy to clipboard"}
        variant="ghost-secondary"
        size="xs"
        onClick={handleCopyToClipboard}
        icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
        className="text-muted-foreground"
      />
    );
  }

  // Show retry button as long as it's not streaming
  if (agentMessageToRender.status !== "created") {
    buttons.push(
      <Button
        key="retry-msg-button"
        tooltip="Retry"
        variant="ghost-secondary"
        size="xs"
        onClick={() => {
          void retryHandler({
            conversationId,
            messageId: agentMessageToRender.sId,
          });
        }}
        icon={ArrowPathIcon}
        className="text-muted-foreground"
        disabled={isRetryHandlerProcessing || shouldStream}
      />
    );
  }

  // Add feedback buttons in the end of the array if the agent is not global nor in draft (= inside agent builder)
  if (
    agentMessageToRender.status !== "created" &&
    agentMessageToRender.status !== "failed" &&
    !isGlobalAgent &&
    agentMessageToRender.configuration.status !== "draft"
  ) {
    buttons.push(
      <Separator key="separator" orientation="vertical" />,
      <FeedbackSelector
        key="feedback-selector"
        {...messageFeedback}
        getPopoverInfo={PopoverContent}
      />
    );
  }

  const retryHandler = useCallback(
    async ({
      conversationId,
      messageId,
      blockedOnly = false,
    }: {
      conversationId: string;
      messageId: string;
      blockedOnly?: boolean;
    }) => {
      setIsRetryHandlerProcessing(true);
      await fetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/retry?blocked_only=${blockedOnly}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      setIsRetryHandlerProcessing(false);
    },
    [owner.sId]
  );

  const { configuration: agentConfiguration } = agentMessageToRender;

  const citations = React.useMemo(
    () => getCitations({ activeReferences }),
    [activeReferences]
  );

  const canMention = agentConfiguration.canRead;
  const isArchived = agentConfiguration.status === "archived";

  // Determine if this should be displayed as "agentAsTool" type.
  const isDustDeep = agentConfiguration.sId === GLOBAL_AGENTS_SID.DUST_DEEP;
  const isDeepDive = isAgentMessageHandover && isDustDeep;

  const renderName = useCallback(
    () =>
      isDeepDive ? (
        <span className="inline-flex items-center text-muted-foreground dark:text-muted-foreground-night">
          <Icon visual={AtomIcon} size="sm" />
          <span className="ml-1">Deep Dive</span>
        </span>
      ) : (
        <AgentHandle
          assistant={{
            sId: agentConfiguration.sId,
            name: agentConfiguration.name + (isArchived ? " (archived)" : ""),
          }}
          canMention={canMention}
          isDisabled={isArchived}
        />
      ),
    [
      agentConfiguration.name,
      agentConfiguration.sId,
      canMention,
      isArchived,
      isDeepDive,
    ]
  );

  return (
    <ConversationMessage
      pictureUrl={agentConfiguration.pictureUrl}
      name={agentConfiguration.name}
      buttons={buttons.length > 0 ? buttons : undefined}
      avatarBusy={agentMessageToRender.status === "created"}
      isDisabled={isArchived}
      renderName={renderName}
      timestamp={
        agentMessageToRender.completedTs && !isDeepDive
          ? formatTimestring(agentMessageToRender.completedTs)
          : undefined
      }
      completionStatus={
        <AgentMessageCompletionStatus agentMessage={agentMessageToRender} />
      }
      type={isDeepDive ? "agentAsTool" : "agent"}
      citations={citations}
    >
      <div>
        <AgentMessageContent
          owner={owner}
          conversationId={conversationId}
          retryHandler={retryHandler}
          isLastMessage={isLastMessage}
          messageStreamState={messageStreamState}
          references={references}
          streaming={shouldStream}
          lastTokenClassification={
            messageStreamState.agentState === "thinking" ? "tokens" : null
          }
          activeReferences={activeReferences}
          setActiveReferences={setActiveReferences}
        />
      </div>
    </ConversationMessage>
  );
}

function AgentMessageContent({
  isLastMessage,
  messageStreamState,
  references,
  streaming,
  lastTokenClassification,
  owner,
  conversationId,
  activeReferences,
  setActiveReferences,
  retryHandler,
}: {
  isLastMessage: boolean;
  owner: LightWorkspaceType;
  conversationId: string;
  retryHandler: (params: {
    conversationId: string;
    messageId: string;
    blockedOnly?: boolean;
  }) => Promise<void>;
  messageStreamState: MessageTemporaryState;
  references: { [key: string]: MarkdownCitation };
  streaming: boolean;
  lastTokenClassification: null | "tokens" | "chain_of_thought";
  activeReferences: { index: number; document: MarkdownCitation }[];
  setActiveReferences: (
    references: {
      index: number;
      document: MarkdownCitation;
    }[]
  ) => void;
}) {
  const methods = useVirtuosoMethods<
    VirtuosoMessage,
    VirtuosoMessageListContext
  >();
  const agentMessage = messageStreamState.message;
  const { sId, configuration: agentConfiguration } = agentMessage;

  const retryHandlerWithResetState = useCallback(
    async (error: PersonalAuthenticationRequiredErrorContent) => {
      methods.data.map((m) =>
        isMessageTemporayState(m) && getMessageSId(m) === sId
          ? {
              ...m,
              message: {
                ...m.message,
                status: "created",
                error: null,
              },
              // Reset the agent state to "acting" to allow for streaming to continue.
              agentState: "acting",
            }
          : m
      );

      // Retry on the event's conversationId, which may be coming from a subagent.
      if (error.metadata.conversationId !== conversationId) {
        await retryHandler({
          conversationId: error.metadata.conversationId,
          messageId: error.metadata.messageId,
          blockedOnly: true,
        });
      }
      // Retry on the main conversation.
      await retryHandler({
        conversationId,
        messageId: sId,
        blockedOnly: true,
      });
    },
    [conversationId, methods.data, retryHandler, sId]
  );

  // References logic.
  function updateActiveReferences(document: MarkdownCitation, index: number) {
    const existingIndex = activeReferences.find((r) => r.index === index);
    if (!existingIndex) {
      setActiveReferences([...activeReferences, { index, document }]);
    }
  }

  const additionalMarkdownComponents: Components = React.useMemo(
    () => ({
      visualization: getVisualizationPlugin(
        owner,
        agentConfiguration.sId,
        conversationId,
        sId
      ),
      sup: CiteBlock,
      mention: getMentionPlugin(owner),
      dustimg: getImgPlugin(owner),
    }),
    [owner, conversationId, sId, agentConfiguration.sId]
  );

  const additionalMarkdownPlugins: PluggableList = React.useMemo(
    () => [
      mentionDirective,
      getCiteDirective(),
      visualizationDirective,
      imgDirective,
    ],
    []
  );

  // Auto-open interactive content drawer when interactive files are available.
  const { interactiveFiles } = useAutoOpenInteractiveContent({
    messageStreamState,
    agentMessageToRender: agentMessage,
    isLastMessage,
  });

  if (agentMessage.status === "failed") {
    const { error } = agentMessage;
    if (isPersonalAuthenticationRequiredErrorContent(error)) {
      return (
        <MCPServerPersonalAuthenticationRequired
          owner={owner}
          mcpServerId={error.metadata.mcp_server_id}
          provider={error.metadata.provider}
          scope={error.metadata.scope}
          retryHandler={() => retryHandlerWithResetState(error)}
        />
      );
    }
    return (
      <ErrorMessage
        error={
          agentMessage.error ?? {
            message: "Unexpected Error",
            code: "unexpected_error",
            metadata: {},
          }
        }
        retryHandler={async () =>
          retryHandler({ conversationId, messageId: agentMessage.sId })
        }
      />
    );
  }

  // Get in-progress images.
  const inProgressImages = Array.from(
    messageStreamState.actionProgress.entries()
  )
    .filter(([, progress]) =>
      isImageProgressOutput(progress.progress?.data.output)
    )
    .map(([actionId, progress]) => ({
      id: actionId,
      isLoading: true,
      progress: progress.progress?.progress,
    }));

  // Get completed images.
  const completedImages = agentMessage.generatedFiles.filter((file) =>
    isSupportedImageContentType(file.contentType)
  );

  const generatedFiles = agentMessage.generatedFiles
    .filter((file) => !file.hidden)
    .filter(
      (file) =>
        !isSupportedImageContentType(file.contentType) &&
        !isInteractiveContentFileContentType(file.contentType)
    );

  return (
    <div className="flex flex-col gap-y-4">
      <AgentMessageActions
        agentMessage={agentMessage}
        lastAgentStateClassification={messageStreamState.agentState}
        actionProgress={messageStreamState.actionProgress}
        owner={owner}
      />
      <AgentMessageInteractiveContentGeneratedFiles files={interactiveFiles} />
      {(inProgressImages.length > 0 || completedImages.length > 0) && (
        <InteractiveImageGrid
          images={[
            ...completedImages.map((image) => ({
              imageUrl: `/api/w/${owner.sId}/files/${image.fileId}?action=view`,
              downloadUrl: `/api/w/${owner.sId}/files/${image.fileId}?action=download`,
              alt: `${image.title}`,
              title: `${image.title}`,
              isLoading: false,
            })),
            ...inProgressImages.map(() => ({
              alt: "",
              title: "",
              isLoading: true,
            })),
          ]}
        />
      )}

      {agentMessage.content !== null && (
        <div>
          {lastTokenClassification !== "chain_of_thought" &&
          agentMessage.content === "" ? (
            <div className="blinking-cursor">
              <span></span>
            </div>
          ) : (
            <CitationsContext.Provider
              value={{
                references,
                updateActiveReferences,
              }}
            >
              <Markdown
                content={sanitizeVisualizationContent(agentMessage.content)}
                isStreaming={streaming && lastTokenClassification === "tokens"}
                isLastMessage={isLastMessage}
                additionalMarkdownComponents={additionalMarkdownComponents}
                additionalMarkdownPlugins={additionalMarkdownPlugins}
              />
            </CitationsContext.Provider>
          )}
        </div>
      )}
      {generatedFiles.length > 0 && (
        <div className="mt-2 grid grid-cols-5 gap-1">
          {getCitations({
            activeReferences: generatedFiles.map((file) => ({
              index: -1,
              document: {
                href: `/api/w/${owner.sId}/files/${file.fileId}`,
                icon: <DocumentIcon />,
                title: file.title,
              },
            })),
          })}
        </div>
      )}
      {agentMessage.status === "cancelled" && (
        <div>
          <Chip
            label="The message generation was interrupted"
            size="xs"
            className="mt-4"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Reconstructs the agent message to render based on the message fetched and the data streamed.
 * The message does not contain actions, we may only have some if we received through the stream.
 */
function getAgentMessageToRender({
  message,
  messageStreamState,
}: {
  message: LightAgentMessageType;
  messageStreamState: MessageTemporaryState;
}): LightAgentMessageType | LightAgentMessageWithActionsType {
  switch (message.status) {
    case "succeeded":
    case "failed":
      return message;
    case "cancelled":
      if (messageStreamState.message.status === "created") {
        return { ...messageStreamState.message, status: "cancelled" };
      }
      return messageStreamState.message;
    case "created":
      return messageStreamState.message;
    default:
      assertNever(message.status);
  }
}

function getCitations({
  activeReferences,
}: {
  activeReferences: {
    index: number;
    document: MarkdownCitation;
  }[];
}) {
  activeReferences.sort((a, b) => a.index - b.index);

  return activeReferences.map(({ document, index }) => {
    return (
      <DefaultAgentMessageGeneratedFiles
        key={index}
        document={document}
        index={index}
      />
    );
  });
}
