import {
  ArrowPathIcon,
  Button,
  ButtonGroup,
  Chip,
  ClipboardCheckIcon,
  ClipboardIcon,
  InteractiveImageGrid,
  MoreIcon,
  StopIcon,
  TrashIcon,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import { marked } from "marked";
import React, { useCallback, useContext, useMemo } from "react";
import type { Components } from "react-markdown";

import { AgentMessageMarkdown } from "@app/components/assistant/AgentMessageMarkdown";
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
import { MCPToolValidationRequired } from "@app/components/assistant/conversation/MCPToolValidationRequired";
import {
  ConversationMessageAvatar,
  ConversationMessageContent,
  ConversationMessageTitle,
  NewConversationMessageContainer,
} from "@app/components/assistant/conversation/NewConversationMessage";
import type {
  AgentMessageStateWithControlEvent,
  MessageTemporaryState,
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  isHandoverUserMessage,
  isMessageTemporayState,
  isUserMessage,
} from "@app/components/assistant/conversation/types";
import { ConfirmContext } from "@app/components/Confirm";
import {
  CitationsContext,
  CiteBlock,
} from "@app/components/markdown/CiteBlock";
import type { MCPReferenceCitation } from "@app/components/markdown/MCPReferenceCitation";
import { getQuickReplyPlugin } from "@app/components/markdown/QuickReplyBlock";
import { getToolSetupPlugin } from "@app/components/markdown/tool/tool";
import {
  getVisualizationPlugin,
  sanitizeVisualizationContent,
} from "@app/components/markdown/VisualizationBlock";
import { useAgentMessageStream } from "@app/hooks/useAgentMessageStream";
import { useDeleteAgentMessage } from "@app/hooks/useDeleteAgentMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import { useRetryMessage } from "@app/hooks/useRetryMessage";
import { isImageProgressOutput } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { DustError } from "@app/lib/error";
import {
  useCancelMessage,
  usePostOnboardingFollowUp,
} from "@app/lib/swr/conversations";
import { formatTimestring } from "@app/lib/utils/timestamps";
import type {
  ContentFragmentsType,
  LightWorkspaceType,
  Result,
  RichAgentMention,
  RichMention,
  UserType,
  WorkspaceType,
} from "@app/types";
import {
  assertNever,
  GLOBAL_AGENTS_SID,
  isInteractiveContentFileContentType,
  isSupportedImageContentType,
} from "@app/types";

interface AgentMessageProps {
  conversationId: string;
  isLastMessage: boolean;
  agentMessage: MessageTemporaryState;
  messageFeedback: FeedbackSelectorProps;
  owner: WorkspaceType;
  user: UserType;
  triggeringUser: UserType | null;
  handleSubmit: (
    input: string,
    mentions: RichMention[],
    contentFragments: ContentFragmentsType
  ) => Promise<Result<undefined, DustError>>;
}

export function AgentMessage({
  conversationId,
  isLastMessage,
  agentMessage,
  messageFeedback,
  owner,
  user,
  triggeringUser,
  handleSubmit,
}: AgentMessageProps) {
  const sId = agentMessage.sId;

  const [isRetryHandlerProcessing, setIsRetryHandlerProcessing] =
    React.useState<boolean>(false);

  const [activeReferences, setActiveReferences] = React.useState<
    { index: number; document: MCPReferenceCitation }[]
  >([]);
  const [isCopied, copy] = useCopyToClipboard();
  const sendNotification = useSendNotification();
  const confirm = useContext(ConfirmContext);

  const isGlobalAgent = Object.values(GLOBAL_AGENTS_SID).includes(
    agentMessage.configuration.sId as GLOBAL_AGENTS_SID
  );

  const { enqueueBlockedAction, removeAllBlockedActionsForMessage } =
    useBlockedActionsContext();

  const methods = useVirtuosoMethods<
    VirtuosoMessage,
    VirtuosoMessageListContext
  >();

  const isTriggeredByCurrentUser = useMemo(
    () => triggeringUser?.sId === user.sId,
    [triggeringUser, user.sId]
  );

  const { shouldStream } = useAgentMessageStream({
    agentMessage: agentMessage,
    conversationId,
    owner,
    onEventCallback: useCallback(
      (eventPayload: {
        eventId: string;
        data: AgentMessageStateWithControlEvent;
      }) => {
        switch (eventPayload.data.type) {
          case "tool_approve_execution":
            enqueueBlockedAction({
              messageId: sId,
              blockedAction: {
                status: "blocked_validation_required",
                actionId: eventPayload.data.actionId,
                authorizationInfo: null,
                configurationId: eventPayload.data.configurationId,
                conversationId: eventPayload.data.conversationId,
                created: eventPayload.data.created,
                inputs: eventPayload.data.inputs,
                messageId: eventPayload.data.messageId,
                metadata: eventPayload.data.metadata,
                stake: eventPayload.data.stake,
                userId: eventPayload.data.userId,
              },
            });
            break;

          case "tool_personal_auth_required":
            const { authError } = eventPayload.data;

            enqueueBlockedAction({
              messageId: sId,
              blockedAction: {
                status: "blocked_authentication_required",
                actionId: eventPayload.data.actionId,
                authorizationInfo: {
                  ...authError,
                  supported_use_cases: [],
                },
                configurationId: eventPayload.data.configurationId,
                conversationId: eventPayload.data.conversationId,
                created: eventPayload.data.created,
                inputs: eventPayload.data.inputs,
                messageId: eventPayload.data.messageId,
                metadata: eventPayload.data.metadata,
                stake: eventPayload.data.stake,
                userId: eventPayload.data.userId,
              },
            });
            break;

          case "agent_message_success":
          case "agent_generation_cancelled":
          case "agent_error":
          case "generation_tokens":
            // We can remove all blocked actions for this message (especially useful to let other users see the message updates)
            void removeAllBlockedActionsForMessage({
              messageId: sId,
              conversationId,
            });
            break;
          case "agent_action_success":
          case "end-of-stream":
          case "tool_error":
          case "tool_notification":
          case "tool_params":
            // Do nothing
            break;
          default:
            assertNever(eventPayload.data);
        }
      },
      [
        enqueueBlockedAction,
        sId,
        removeAllBlockedActionsForMessage,
        conversationId,
      ]
    ),
    streamId: `message-${sId}`,
    useFullChainOfThought: false,
  });

  const isDeleted = agentMessage.visibility === "deleted";
  const cancelMessage = useCancelMessage({ owner, conversationId });

  const references = useMemo(
    () =>
      Object.entries(agentMessage.citations ?? {}).reduce<
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
    [agentMessage.citations]
  );

  // GenerationContext: to know if we are generating or not.
  const generationContext = React.useContext(GenerationContext);
  if (!generationContext) {
    throw new Error(
      "AgentMessage must be used within a GenerationContextProvider"
    );
  }
  React.useEffect(() => {
    if (shouldStream) {
      generationContext.addGeneratingMessage({
        messageId: sId,
        conversationId,
      });
    } else {
      generationContext.removeGeneratingMessage({ messageId: sId });
    }
  }, [shouldStream, generationContext, sId, conversationId]);

  const PopoverContent = useCallback(
    () => (
      <FeedbackSelectorPopoverContent
        owner={owner}
        agentMessageToRender={agentMessage}
      />
    ),
    [owner, agentMessage]
  );

  async function handleCopyToClipboard() {
    const messageContent = agentMessage.content ?? "";
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
    generationContext.getConversationGeneratingMessages(conversationId).length >
    1;

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

  const isAgentMessageHandingOver = methods.data
    .get()
    .some(
      (m) =>
        isUserMessage(m) &&
        isHandoverUserMessage(m) &&
        m.agenticMessageData?.originMessageId === sId
    );

  const parentAgentMessage = methods.data
    .get()
    .find(
      (m) =>
        isMessageTemporayState(m) && m.sId === agentMessage.parentAgentMessageId
    );

  const parentAgent =
    parentAgentMessage && isMessageTemporayState(parentAgentMessage)
      ? parentAgentMessage.configuration
      : null;

  const canDeleteAgentMessage =
    !isDeleted && agentMessage.status !== "created" && isTriggeredByCurrentUser;

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

    await deleteAgentMessage(agentMessage.sId);

    methods.data.map((m) => {
      if (m.sId === agentMessage.sId) {
        return {
          ...m,
          visibility: "deleted",
        };
      }
      return m;
    });
  }, [
    isDeleted,
    canDeleteAgentMessage,
    isDeleting,
    confirm,
    deleteAgentMessage,
    agentMessage.sId,
    methods.data,
  ]);

  const shouldShowCopy =
    !isDeleted &&
    agentMessage.status !== "created" &&
    agentMessage.status !== "failed";

  const shouldShowRetry =
    !isDeleted &&
    agentMessage.status !== "created" &&
    agentMessage.status !== "failed" &&
    !shouldStream &&
    !isAgentMessageHandingOver;

  const shouldShowFeedback =
    !isDeleted &&
    agentMessage.status !== "created" &&
    agentMessage.status !== "failed" &&
    !isGlobalAgent &&
    agentMessage.configuration.status !== "draft";

  const retryMessage = useRetryMessage({ owner });

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
      await retryMessage({
        conversationId,
        messageId,
        blockedOnly,
      });
      setIsRetryHandlerProcessing(false);
    },
    [retryMessage]
  );

  // Add feedback buttons first (thumbs up/down)
  if (shouldShowFeedback) {
    messageButtons.push(
      <FeedbackSelector
        key="feedback-selector"
        {...messageFeedback}
        getPopoverInfo={PopoverContent}
      />
    );
  }

  // Add copy button or split button with dropdown
  if (shouldShowCopy && (shouldShowRetry || canDeleteAgentMessage)) {
    const dropdownItems = [];

    if (shouldShowRetry) {
      dropdownItems.push({
        label: "Retry",
        icon: ArrowPathIcon,
        onSelect: () => {
          void retryHandler({
            conversationId,
            messageId: agentMessage.sId,
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
              messageId: agentMessage.sId,
            });
          }}
          icon={ArrowPathIcon}
          className="text-muted-foreground"
          disabled={isRetryHandlerProcessing || shouldStream}
        />
      );
    }
  }

  const { configuration: agentConfiguration } = agentMessage;

  const citations = React.useMemo(
    () => getCitations({ activeReferences, owner, conversationId }),
    [activeReferences, conversationId, owner]
  );

  const handleQuickReply = React.useCallback(
    async (reply: string) => {
      const mention: RichAgentMention = {
        id: agentMessage.configuration.sId,
        type: "agent",
        label: agentMessage.configuration.name,
        pictureUrl: agentMessage.configuration.pictureUrl ?? "",
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
    [agentMessage.configuration, handleSubmit, sendNotification]
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
            isBusy={agentMessage.status === "created"}
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
      agentMessage.status,
    ]
  );

  const timestamp = parentAgent
    ? undefined
    : formatTimestring(agentMessage.completedTs ?? agentMessage.created);

  return (
    <NewConversationMessageContainer messageType="agent" type="agent">
      <ConversationMessageAvatar
        className="flex"
        avatarUrl={agentConfiguration.pictureUrl}
        name={agentConfiguration.name}
        isBusy={agentMessage.status === "created"}
        isDisabled={isArchived}
        type="agent"
      />
      <div className="flex w-full min-w-0 flex-col gap-3">
        <ConversationMessageTitle
          name={agentConfiguration.name}
          timestamp={timestamp}
          completionStatus={
            isDeleted ? undefined : (
              <AgentMessageCompletionStatus agentMessage={agentMessage} />
            )
          }
          renderName={renderName}
        />
        <ConversationMessageContent
          citations={isDeleted ? undefined : citations}
          type="agent"
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
              agentMessage={agentMessage}
              references={references}
              streaming={shouldStream}
              lastTokenClassification={
                agentMessage.streaming.agentState === "thinking"
                  ? "tokens"
                  : null
              }
              activeReferences={activeReferences}
              setActiveReferences={setActiveReferences}
              triggeringUser={triggeringUser}
            />
          )}
        </ConversationMessageContent>
        {messageButtons && messageButtons.length > 0 && (
          <div className="flex justify-start gap-3">{messageButtons}</div>
        )}
      </div>
    </NewConversationMessageContainer>
  );
}

function AgentMessageContent({
  triggeringUser,
  isLastMessage,
  agentMessage,
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
  triggeringUser: UserType | null;
  isLastMessage: boolean;
  owner: LightWorkspaceType;
  conversationId: string;
  retryHandler: (params: {
    conversationId: string;
    messageId: string;
    blockedOnly?: boolean;
  }) => Promise<void>;
  agentMessage: MessageTemporaryState;
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

  const { sId, configuration: agentConfiguration } = agentMessage;

  const { postFollowUp } = usePostOnboardingFollowUp({
    workspaceId: owner.sId,
    conversationId,
  });

  const { getFirstBlockedActionForMessage } = useBlockedActionsContext();

  const blockedAction = getFirstBlockedActionForMessage(sId);

  const retryHandlerWithResetState = useCallback(
    // Conversation and message might be different than the current ones in case of subagents.
    async (conversationAndMessage: {
      conversationId: string;
      messageId: string;
    }) => {
      methods.data.map((m) =>
        isMessageTemporayState(m) && m.sId === sId
          ? {
              ...m,
              status: "created",
              error: null,
              // Reset the agent state to "acting" to allow for streaming to continue.
              streaming: {
                ...m.streaming,
                agentState: "acting",
              },
            }
          : m
      );

      // Retry on the event's conversationId, which may be coming from a subagent.
      if (conversationAndMessage.conversationId !== conversationId) {
        await retryHandler({
          blockedOnly: true,
          conversationId: conversationAndMessage.conversationId,
          messageId: conversationAndMessage.messageId,
        });
      }
      // Retry on the main conversation.
      await retryHandler({
        conversationId,
        blockedOnly: true,
        messageId: sId,
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

  // Auto-open interactive content drawer when interactive files are available.
  const { interactiveFiles } = useAutoOpenInteractiveContent({
    agentMessage,
    isLastMessage,
  });

  if (blockedAction) {
    switch (blockedAction.status) {
      case "blocked_validation_required":
        return (
          <MCPToolValidationRequired
            triggeringUser={triggeringUser}
            owner={owner}
            blockedAction={blockedAction}
            conversationId={conversationId}
            messageId={sId}
          />
        );

      case "blocked_authentication_required":
        return (
          <MCPServerPersonalAuthenticationRequired
            triggeringUser={triggeringUser}
            owner={owner}
            mcpServerId={blockedAction.metadata.mcpServerId}
            provider={blockedAction.authorizationInfo.provider}
            scope={blockedAction.authorizationInfo.scope}
            retryHandler={() =>
              retryHandlerWithResetState({
                conversationId: blockedAction.conversationId,
                messageId: blockedAction.messageId,
              })
            }
          />
        );
    }
  }

  if (agentMessage.status === "failed") {
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
    agentMessage.streaming.actionProgress.entries()
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
        lastAgentStateClassification={agentMessage.streaming.agentState}
        actionProgress={agentMessage.streaming.actionProgress}
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
            <AgentMessageMarkdown
              content={sanitizeVisualizationContent(agentMessage.content)}
              owner={owner}
              isStreaming={streaming && lastTokenClassification === "tokens"}
              isLastMessage={isLastMessage}
              additionalMarkdownComponents={additionalMarkdownComponents}
            ></AgentMessageMarkdown>
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
