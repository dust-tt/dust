import {
  ArrowPathIcon,
  Button,
  ButtonGroup,
  Chip,
  ClipboardCheckIcon,
  ClipboardIcon,
  ConversationMessage,
  InteractiveImageGrid,
  Markdown,
  MoreIcon,
  Separator,
  StopIcon,
  TrashIcon,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import { marked } from "marked";
import React, { useCallback, useContext, useMemo } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

import { AgentMessageActions } from "@app/components/assistant/conversation/actions/AgentMessageActions";
import { AgentHandle } from "@app/components/assistant/conversation/AgentHandle";
import { AgentMessageCompletionStatus } from "@app/components/assistant/conversation/AgentMessageCompletionStatus";
import { AgentMessageInteractiveContentGeneratedFiles } from "@app/components/assistant/conversation/AgentMessageGeneratedFiles";
import { AttachmentCitation } from "@app/components/assistant/conversation/attachment/AttachmentCitation";
import { markdownCitationToAttachmentCitation } from "@app/components/assistant/conversation/attachment/utils";
import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { DeletedMessage } from "@app/components/assistant/conversation/DeletedMessage";
import { ErrorMessage } from "@app/components/assistant/conversation/ErrorMessage";
import type { FeedbackSelectorProps } from "@app/components/assistant/conversation/FeedbackSelector";
import { FeedbackSelector } from "@app/components/assistant/conversation/FeedbackSelector";
import { FeedbackSelectorPopoverContent } from "@app/components/assistant/conversation/FeedbackSelectorPopoverContent";
import { GenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import { useAutoOpenInteractiveContent } from "@app/components/assistant/conversation/interactive_content/useAutoOpenInteractiveContent";
import { MCPServerPersonalAuthenticationRequired } from "@app/components/assistant/conversation/MCPServerPersonalAuthenticationRequired";
import { NewConversationMessage } from "@app/components/assistant/conversation/NewConversationMessage";
import type {
  AgentMessageStateWithControlEvent,
  MessageTemporaryState,
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  getMessageSId,
  isHandoverUserMessage,
  isMessageTemporayState,
  isUserMessage,
} from "@app/components/assistant/conversation/types";
import { ConfirmContext } from "@app/components/Confirm";
import {
  CitationsContext,
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import { getImgPlugin, imgDirective } from "@app/components/markdown/Image";
import type { MCPReferenceCitation } from "@app/components/markdown/MCPReferenceCitation";
import {
  getQuickReplyPlugin,
  quickReplyDirective,
} from "@app/components/markdown/QuickReplyBlock";
import {
  getToolSetupPlugin,
  toolDirective,
} from "@app/components/markdown/tool/tool";
import {
  getVisualizationPlugin,
  sanitizeVisualizationContent,
  visualizationDirective,
} from "@app/components/markdown/VisualizationBlock";
import { useAgentMessageStream } from "@app/hooks/useAgentMessageStream";
import { useDeleteAgentMessage } from "@app/hooks/useDeleteAgentMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import { isImageProgressOutput } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { DustError } from "@app/lib/error";
import {
  agentMentionDirective,
  getAgentMentionPlugin,
  getUserMentionPlugin,
  userMentionDirective,
} from "@app/lib/mentions/markdown/plugin";
import {
  useCancelMessage,
  useConversationMessage,
  usePostOnboardingFollowUp,
} from "@app/lib/swr/conversations";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { formatTimestring } from "@app/lib/utils/timestamps";
import type {
  ContentFragmentsType,
  LightAgentMessageType,
  LightAgentMessageWithActionsType,
  LightWorkspaceType,
  PersonalAuthenticationRequiredErrorContent,
  Result,
  RichMention,
  UserType,
  WorkspaceType,
} from "@app/types";
import {
  assertNever,
  GLOBAL_AGENTS_SID,
  isAgentMessageType,
  isInteractiveContentFileContentType,
  isPersonalAuthenticationRequiredErrorContent,
  isSupportedImageContentType,
} from "@app/types";

interface AgentMessageProps {
  conversationId: string;
  isLastMessage: boolean;
  messageStreamState: MessageTemporaryState;
  messageFeedback: FeedbackSelectorProps;
  owner: WorkspaceType;
  user: UserType;
  handleSubmit: (
    input: string,
    mentions: RichMention[],
    contentFragments: ContentFragmentsType
  ) => Promise<Result<undefined, DustError>>;
}

export function AgentMessage({
  conversationId,
  isLastMessage,
  messageStreamState,
  messageFeedback,
  owner,
  user,
  handleSubmit,
}: AgentMessageProps) {
  const sId = getMessageSId(messageStreamState);

  const [isRetryHandlerProcessing, setIsRetryHandlerProcessing] =
    React.useState<boolean>(false);

  const [activeReferences, setActiveReferences] = React.useState<
    { index: number; document: MCPReferenceCitation }[]
  >([]);
  const [isCopied, copy] = useCopyToClipboard();
  const sendNotification = useSendNotification();
  const confirm = useContext(ConfirmContext);

  const isGlobalAgent = Object.values(GLOBAL_AGENTS_SID).includes(
    messageStreamState.message.configuration.sId as GLOBAL_AGENTS_SID
  );

  const {
    showBlockedActionsDialog,
    enqueueBlockedAction,
    mutateBlockedActions,
  } = useBlockedActionsContext();

  const { mutateMessage } = useConversationMessage({
    conversationId,
    workspaceId: owner.sId,
    messageId: sId,
    options: { disabled: true },
  });

  const parentAgentMessage = useConversationMessage({
    conversationId,
    workspaceId: owner.sId,
    messageId: messageStreamState.message.parentAgentMessageId,
    options: {
      disabled: messageStreamState.message.parentAgentMessageId === null,
    },
  });

  const { shouldStream } = useAgentMessageStream({
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
        } else if (
          eventType === "tool_error" &&
          isPersonalAuthenticationRequiredErrorContent(eventPayload.data.error)
        ) {
          void mutateBlockedActions();
        }
      },
      [
        showBlockedActionsDialog,
        enqueueBlockedAction,
        sId,
        mutateBlockedActions,
      ]
    ),
    streamId: `message-${sId}`,
    useFullChainOfThought: false,
  });

  const agentMessageToRender = getAgentMessageToRender({
    message: messageStreamState.message,
    messageStreamState: messageStreamState,
  });
  const isDeleted = agentMessageToRender.visibility === "deleted";
  const cancelMessage = useCancelMessage({ owner, conversationId });

  const references = useMemo(
    () =>
      Object.entries(agentMessageToRender.citations ?? {}).reduce<
        Record<string, MCPReferenceCitation>
      >((acc, [key, citation]) => {
        if (citation) {
          return {
            ...acc,
            [key]: {
              provider: citation.provider,
              href: citation.href,
              title: citation.title,
              description: citation.description,
              contentType: citation.contentType,
              fileId: key,
            },
          };
        }
        return acc;
      }, {}),
    [agentMessageToRender.citations]
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
    if (shouldStream && !isInArray) {
      generationContext.setGeneratingMessages((s) => [
        ...s,
        { messageId: sId, conversationId },
      ]);
    } else if (!shouldStream && isInArray) {
      generationContext.setGeneratingMessages((s) =>
        s.filter((m) => m.messageId !== sId)
      );
    }
  }, [shouldStream, generationContext, sId, conversationId]);

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

  const { deleteAgentMessage, isDeleting } = useDeleteAgentMessage({
    owner,
    conversationId,
  });

  const messageButtons: React.ReactElement[] = [];

  const hasMultiAgents =
    generationContext.generatingMessages.filter(
      (m) => m.conversationId === conversationId
    ).length > 1;

  // Show stop agent button only when streaming with multiple agents
  if (hasMultiAgents && shouldStream) {
    messageButtons.push(
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

  const methods = useVirtuosoMethods<
    VirtuosoMessage,
    VirtuosoMessageListContext
  >();

  const isAgentMessageHandingOver = methods.data
    .get()
    .some(
      (m) =>
        isUserMessage(m) &&
        isHandoverUserMessage(m) &&
        m.agenticMessageData?.originMessageId === sId
    );

  const isTriggeredByCurrentUser = useMemo(() => {
    const parentMessageId = agentMessageToRender.parentMessageId;
    const messages = methods.data.get();
    const parentUserMessage = messages.find(
      (m) => isUserMessage(m) && m.sId === parentMessageId
    );
    if (!parentUserMessage || !isUserMessage(parentUserMessage)) {
      return false;
    }

    return parentUserMessage.user?.sId === user.sId;
  }, [agentMessageToRender.parentMessageId, methods.data, user.sId]);

  const canDeleteAgentMessage =
    !isDeleted &&
    agentMessageToRender.status !== "created" &&
    isTriggeredByCurrentUser;

  const handleDeleteAgentMessage = useCallback(async () => {
    if (isDeleted || !canDeleteAgentMessage || isDeleting) {
      return;
    }

    const confirmed = await confirm({
      title: "Delete message",
      message:
        "Are you sure you want to delete this message? This action cannot be undone.",
      validateLabel: "Delete",
      validateVariant: "warning",
    });

    if (!confirmed) {
      return;
    }

    await deleteAgentMessage(agentMessageToRender.sId);

    methods.data.map((m) => {
      if (
        isMessageTemporayState(m) &&
        getMessageSId(m) === agentMessageToRender.sId
      ) {
        return {
          ...m,
          message: {
            ...m.message,
            visibility: "deleted",
          },
        };
      }
      return m;
    });
  }, [
    agentMessageToRender.sId,
    canDeleteAgentMessage,
    confirm,
    isDeleted,
    deleteAgentMessage,
    isDeleting,
    methods.data,
  ]);

  const shouldShowCopy =
    !isDeleted &&
    agentMessageToRender.status !== "created" &&
    agentMessageToRender.status !== "failed";

  const shouldShowRetry =
    !isDeleted &&
    agentMessageToRender.status !== "created" &&
    agentMessageToRender.status !== "failed" &&
    !shouldStream &&
    !isAgentMessageHandingOver;

  const shouldShowFeedback =
    !isDeleted &&
    agentMessageToRender.status !== "created" &&
    agentMessageToRender.status !== "failed" &&
    !isGlobalAgent &&
    agentMessageToRender.configuration.status !== "draft";

  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
  const userMentionsEnabled = hasFeature("mentions_v2");

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

  // Add feedback buttons first (thumbs up/down)
  if (shouldShowFeedback) {
    messageButtons.push(
      <FeedbackSelector
        key="feedback-selector"
        {...messageFeedback}
        getPopoverInfo={PopoverContent}
        owner={owner}
      />
    );
  }

  // Add separator if we have both feedback and copy buttons
  if (shouldShowFeedback && shouldShowCopy) {
    messageButtons.push(<Separator key="separator" orientation="vertical" />);
  }

  // Add copy button or split button with dropdown (only when mentions_v2 is enabled)
  if (
    userMentionsEnabled &&
    shouldShowCopy &&
    (shouldShowRetry || canDeleteAgentMessage)
  ) {
    const dropdownItems = [];

    if (shouldShowRetry) {
      dropdownItems.push({
        label: "Retry",
        icon: ArrowPathIcon,
        onSelect: () => {
          void retryHandler({
            conversationId,
            messageId: agentMessageToRender.sId,
          });
        },
        disabled: isRetryHandlerProcessing || shouldStream,
      });
    }

    if (canDeleteAgentMessage) {
      dropdownItems.push({
        label: "Delete message",
        icon: TrashIcon,
        onSelect: handleDeleteAgentMessage,
        disabled: isDeleting,
        variant: "warning" as const,
      });
    }

    messageButtons.push(
      <ButtonGroup
        key="split-button-group"
        variant="outline"
        items={[
          {
            type: "button",
            props: {
              tooltip: isCopied ? "Copied!" : "Copy to clipboard",
              variant: "ghost-secondary",
              size: "xs",
              onClick: handleCopyToClipboard,
              icon: isCopied ? ClipboardCheckIcon : ClipboardIcon,
              className: "text-muted-foreground",
            },
          },
          {
            type: "dropdown",
            triggerProps: {
              variant: "ghost-secondary",
              size: "xs",
              icon: MoreIcon,
              className: "text-muted-foreground",
            },
            dropdownProps: {
              items: dropdownItems,
              align: "end",
            },
          },
        ]}
      />
    );
  } else {
    // if mentions_v2 is disabled, show copy button
    if (shouldShowCopy) {
      messageButtons.push(
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

    if (shouldShowRetry) {
      messageButtons.push(
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
  }

  const { configuration: agentConfiguration } = agentMessageToRender;

  const citations = React.useMemo(
    () => getCitations({ activeReferences, owner, conversationId }),
    [activeReferences, conversationId, owner]
  );

  let parentAgent = null;
  if (
    parentAgentMessage.message &&
    isAgentMessageType(parentAgentMessage.message)
  ) {
    parentAgent = parentAgentMessage.message.configuration;
  }

  const handleQuickReply = React.useCallback(
    async (reply: string) => {
      const mention: RichMention = {
        id: agentMessageToRender.configuration.sId,
        type: "agent",
        label: agentMessageToRender.configuration.name,
        pictureUrl: agentMessageToRender.configuration.pictureUrl ?? "",
        description: "",
      };

      const result = await handleSubmit(reply, [mention], {
        uploaded: [],
        contentNodes: [],
      });

      if (result.isErr()) {
        sendNotification({
          type: "error",
          title: "Message not sent",
          description: result.error.message,
        });
      }
    },
    [agentMessageToRender.configuration, handleSubmit, sendNotification]
  );

  const canMention = agentConfiguration.canRead;
  const isArchived = agentConfiguration.status === "archived";

  const renderName = useCallback(
    () => (
      <span className="inline-flex items-center">
        <AgentHandle
          agent={{
            sId: agentConfiguration.sId,
            name: agentConfiguration.name + (isArchived ? " (archived)" : ""),
          }}
          canMention={canMention}
          isDisabled={isArchived}
        />
        {parentAgent && (
          <Chip
            label={`handoff from @${parentAgent.name}`}
            size="xs"
            className="ml-1"
            color="primary"
            isBusy={agentMessageToRender.status === "created"}
          />
        )}
      </span>
    ),
    [
      agentConfiguration.name,
      agentConfiguration.sId,
      canMention,
      isArchived,
      parentAgent,
      agentMessageToRender.status,
    ]
  );

  if (userMentionsEnabled) {
    return (
      <NewConversationMessage
        pictureUrl={agentConfiguration.pictureUrl}
        name={agentConfiguration.name}
        buttons={messageButtons}
        avatarBusy={agentMessageToRender.status === "created"}
        isDisabled={isArchived}
        renderName={renderName}
        timestamp={
          parentAgent
            ? undefined
            : formatTimestring(
                agentMessageToRender.completedTs ?? agentMessageToRender.created
              )
        }
        completionStatus={
          isDeleted ? undefined : (
            <AgentMessageCompletionStatus agentMessage={agentMessageToRender} />
          )
        }
        type="agent"
        citations={isDeleted ? undefined : citations}
      >
        {isDeleted ? (
          <DeletedMessage />
        ) : (
          <AgentMessageContent
            onQuickReplySend={handleQuickReply}
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
        )}
      </NewConversationMessage>
    );
  }

  return (
    <ConversationMessage
      pictureUrl={agentConfiguration.pictureUrl}
      name={agentConfiguration.name}
      buttons={messageButtons.length > 0 ? messageButtons : undefined}
      avatarBusy={agentMessageToRender.status === "created"}
      isDisabled={isArchived}
      renderName={renderName}
      timestamp={
        parentAgent
          ? undefined
          : formatTimestring(
              agentMessageToRender.completedTs ?? agentMessageToRender.created
            )
      }
      completionStatus={
        isDeleted ? undefined : (
          <AgentMessageCompletionStatus agentMessage={agentMessageToRender} />
        )
      }
      type="agent"
      citations={isDeleted ? undefined : citations}
    >
      {isDeleted ? (
        <DeletedMessage />
      ) : (
        <AgentMessageContent
          owner={owner}
          conversationId={conversationId}
          retryHandler={retryHandler}
          isLastMessage={isLastMessage}
          messageStreamState={messageStreamState}
          references={references}
          onQuickReplySend={handleQuickReply}
          streaming={shouldStream}
          lastTokenClassification={
            messageStreamState.agentState === "thinking" ? "tokens" : null
          }
          activeReferences={activeReferences}
          setActiveReferences={setActiveReferences}
        />
      )}
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
  onQuickReplySend,
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
  references: { [key: string]: MCPReferenceCitation };
  streaming: boolean;
  lastTokenClassification: null | "tokens" | "chain_of_thought";
  activeReferences: { index: number; document: MCPReferenceCitation }[];
  setActiveReferences: (
    references: {
      index: number;
      document: MCPReferenceCitation;
    }[]
  ) => void;
  onQuickReplySend: (message: string) => Promise<void>;
}) {
  const methods = useVirtuosoMethods<
    VirtuosoMessage,
    VirtuosoMessageListContext
  >();

  const agentMessage = messageStreamState.message;
  const { sId, configuration: agentConfiguration } = agentMessage;

  const { postFollowUp } = usePostOnboardingFollowUp({
    workspaceId: owner.sId,
    conversationId,
  });

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
  function updateActiveReferences(
    document: MCPReferenceCitation,
    index: number
  ) {
    const existingIndex = activeReferences.find((r) => r.index === index);
    if (!existingIndex) {
      setActiveReferences([...activeReferences, { index, document }]);
    }
  }

  const handleToolSetupComplete = React.useCallback(
    (toolId: string) => {
      void postFollowUp(toolId);
    },
    [postFollowUp]
  );

  const additionalMarkdownComponents: Components = React.useMemo(
    () => ({
      visualization: getVisualizationPlugin(
        owner,
        agentConfiguration.sId,
        conversationId,
        sId
      ),
      sup: CiteBlock,
      // Warning: we can't rename easily `mention` to agent_mention, because the messages DB contains this name
      mention: getAgentMentionPlugin(owner),
      mention_user: getUserMentionPlugin(owner),
      dustimg: getImgPlugin(owner),
      quickReply: getQuickReplyPlugin(onQuickReplySend, isLastMessage),
      toolSetup: getToolSetupPlugin(owner, handleToolSetupComplete),
    }),
    [
      owner,
      conversationId,
      sId,
      agentConfiguration.sId,
      onQuickReplySend,
      isLastMessage,
      handleToolSetupComplete,
    ]
  );

  const additionalMarkdownPlugins: PluggableList = React.useMemo(
    () => [
      agentMentionDirective,
      userMentionDirective,
      getCiteDirective(),
      visualizationDirective,
      imgDirective,
      toolDirective,
      quickReplyDirective,
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
        </div>
      )}
      {generatedFiles.length > 0 && (
        <div className="mt-2 grid grid-cols-5 gap-1">
          {getCitations({
            activeReferences: generatedFiles.map((file) => ({
              index: -1,
              document: {
                fileId: file.fileId,
                contentType: file.contentType,
                href: `/api/w/${owner.sId}/files/${file.fileId}`,
                title: file.title,
              },
            })),
            owner,
            conversationId,
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
  owner,
  conversationId,
}: {
  activeReferences: {
    index: number;
    document: MCPReferenceCitation;
  }[];
  owner: LightWorkspaceType;
  conversationId: string;
}) {
  activeReferences.sort((a, b) => a.index - b.index);

  return activeReferences.map(({ document, index }) => {
    const attachmentCitation = markdownCitationToAttachmentCitation(document);
    return (
      <AttachmentCitation
        key={index}
        attachmentCitation={attachmentCitation}
        owner={owner}
        conversationId={conversationId}
      />
    );
  });
}
