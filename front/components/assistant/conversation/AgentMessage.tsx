import { ToolGeneratedFileDetails } from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import { AgentMessageMarkdown } from "@app/components/assistant/AgentMessageMarkdown";
import { AgentHandle } from "@app/components/assistant/conversation/AgentHandle";
import { AgentMessageInteractiveContentGeneratedFiles } from "@app/components/assistant/conversation/AgentMessageGeneratedFiles";
import { InlineActivitySteps } from "@app/components/assistant/conversation/actions/inline/InlineActivitySteps";
import { AttachmentCitation } from "@app/components/assistant/conversation/attachment/AttachmentCitation";
import { markdownCitationToAttachmentCitation } from "@app/components/assistant/conversation/attachment/utils";
import { BlockedAction } from "@app/components/assistant/conversation/BlockedAction";
import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { CreditCostPopover } from "@app/components/assistant/conversation/CreditCostPopover";
import { DeletedMessage } from "@app/components/assistant/conversation/DeletedMessage";
import { ErrorMessage } from "@app/components/assistant/conversation/ErrorMessage";
import type { FeedbackSelectorBaseProps } from "@app/components/assistant/conversation/FeedbackSelector";
import { FeedbackSelector } from "@app/components/assistant/conversation/FeedbackSelector";
import { useGenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import type {
  AgentMessageStateWithControlEvent,
  AgentMessageWithStreaming,
  UiView,
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  isAgentMessageWithStreaming,
  isHandoverUserMessage,
  isUserMessage,
  makeInitialMessageStreamState,
} from "@app/components/assistant/conversation/types";
import { useAutoOpenSidePanel } from "@app/components/assistant/conversation/useAutoOpenSidePanel";
import { WorkflowAlertThresholdPausedCard } from "@app/components/assistant/conversation/WorkflowAlertThresholdPausedCard";
import { ConfirmContext } from "@app/components/Confirm";
import { getActionCardPlugin } from "@app/components/markdown/ActionCardDirective";
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
import { getModelWithReasoningEffortLabel } from "@app/components/model_picker/modelPickerUtils";
import {
  useBranchConversation,
  useCancelMessage,
  usePostOnboardingFollowUp,
} from "@app/hooks/conversations";
import { useConversationAttachments } from "@app/hooks/conversations/useConversationAttachments";
import { useConversationSandboxFiles } from "@app/hooks/conversations/useConversationSandboxFiles";
import { useConversationSandboxStatus } from "@app/hooks/conversations/useConversationSandboxStatus";
import { planFileKey } from "@app/hooks/conversations/usePlanFile";
import { useAgentMessageStream } from "@app/hooks/useAgentMessageStream";
import { useDeleteAgentMessage } from "@app/hooks/useDeleteAgentMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import { useRetryMessage } from "@app/hooks/useRetryMessage";
import { isImageProgressOutput } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { OpenUserAnalyticsEvent } from "@app/lib/analytics/events";
import { CONTEXT_WINDOW_DOC_URL } from "@app/lib/api/assistant/errors";
import config from "@app/lib/api/config";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { formatCredits, formatCreditValue } from "@app/lib/client/credits";
import { clientFetch } from "@app/lib/egress/client";
import type { DustError } from "@app/lib/error";
import { FILE_ID_PATTERN } from "@app/lib/files";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { getFilePreviewDirectivePaths } from "@app/lib/markdown/file_preview";
import { extractFromString } from "@app/lib/mentions/format";
import { LinkWrapper } from "@app/lib/platform";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { useResolveWorkflowAlertThresholdPause } from "@app/lib/swr/workflow_alert_threshold";
import { getConversationRoute } from "@app/lib/utils/router";
import { formatTimestring } from "@app/lib/utils/timestamps";
import datadogLogger from "@app/logger/datadogLogger";
import type { FetchConversationMessageResponseLight } from "@app/types/api/assistant/messages";
import {
  canShowAgentConversationActions,
  isGlobalAgentId,
  isGlobalAgentWithFeedback,
} from "@app/types/assistant/assistant";
import { isLightAgentMessageType } from "@app/types/assistant/conversation";
import type {
  RichAgentMention,
  RichMention,
} from "@app/types/assistant/mentions";
import {
  isAgentMention,
  toRichAgentMentionType,
} from "@app/types/assistant/mentions";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import {
  isFrameContentType,
  isSupportedImageContentType,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type {
  LightWorkspaceType,
  UserType,
  WorkspaceType,
} from "@app/types/user";
import type { DropdownMenuItemProps } from "@dust-tt/sparkle";
import {
  Button,
  ButtonGroupDropdown,
  Chip,
  Clipboard,
  ClipboardCheck,
  CoinsStacked01,
  ConversationMessageAvatar,
  ConversationMessageContainer,
  ConversationMessageContent,
  ConversationMessageTitle,
  cn,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  GitBranch01,
  InfoCircle,
  InteractiveImageGrid,
  Link01,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  RefreshCw02,
  Stop,
  Tooltip,
  Trash01,
  TruncatedContent,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import { marked } from "marked";
import type { MutableRefObject, ReactElement, ReactNode } from "react";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";
import { mutate } from "swr";

interface MessageInfoChipProps {
  children: ReactNode;
  label: string;
  title?: string | null;
}

// Popover, not Tooltip: on touch there is no hover, and links inside must stay reachable.
function MessageInfoChip({ children, label, title }: MessageInfoChipProps) {
  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "cursor-pointer rounded-lg border-0 bg-transparent p-0 transition",
            "outline-hidden ring-offset-background",
            "focus-visible:ring-2 focus-visible:ring-highlight-300 focus-visible:ring-offset-1"
          )}
          aria-label={`${label}. Open details.`}
        >
          <Chip label={label} size="xs" color="primary" icon={InfoCircle} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2"
      >
        {title && <div className="font-semibold">{title}</div>}
        <div className="flex flex-col gap-2 text-justify text-sm text-muted-foreground">
          {children}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}

function PremiumDowngradeChip() {
  return (
    <MessageInfoChip label="Auto-switched to Standard">
      <p>
        You have reached your Premium model limit for the current 7-day window,
        so Dust ran this message on a Standard model instead.
      </p>
      <p>
        <LinkWrapper
          href="#personal-usage"
          className="underline hover:text-foreground"
          onClick={() => window.dispatchEvent(new OpenUserAnalyticsEvent())}
        >
          View your Premium model usage in Analytics
        </LinkWrapper>
        .
      </p>
    </MessageInfoChip>
  );
}

function PrunedContextChip() {
  return (
    <MessageInfoChip
      label="Context limit reached"
      title="This conversation reached its size limit"
    >
      <p>
        Dust had to trim part of the tool output used to generate this message
        to fit the model&apos;s context window. This usually happens when a
        search or other tool returns more data than the model can process at
        once.
      </p>
      <p>
        For best accuracy, first use <code>/compact</code> to summarize this
        conversation and free up context. If needed, start a fresh conversation
        or narrow your request.
      </p>
      <p>
        <a
          href={CONTEXT_WINDOW_DOC_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          Learn more
        </a>
      </p>
    </MessageInfoChip>
  );
}

interface AgentMessageProps {
  conversationId: string;
  spaceId: string | null;
  uiView: UiView;
  hideHeader: boolean;
  isLastMessage: boolean;
  agentMessage: AgentMessageWithStreaming;
  messageFeedback: FeedbackSelectorBaseProps;
  owner: WorkspaceType;
  user: UserType;
  triggeringUser: UserType | null;
  isOnboardingConversation: boolean;
  onCompletionStatusClick?: (messageId: string, actionId?: string) => void;
  handleSubmit: (
    input: string,
    mentions: RichMention[],
    contentFragments: ContentFragmentsType
  ) => Promise<Result<undefined, DustError>>;
  additionalMarkdownComponents?: Components;
  additionalMarkdownPlugins?: PluggableList;
  isAutoScrollEnabledRef: MutableRefObject<boolean>;
  isProjectArchived?: boolean;
  setLimitReachedCode?: (code: WorkspaceLimit) => void;
}

export function AgentMessage({
  conversationId,
  spaceId,
  uiView,
  hideHeader,
  isLastMessage,
  agentMessage,
  messageFeedback,
  owner,
  user,
  triggeringUser,
  isOnboardingConversation,
  onCompletionStatusClick,
  handleSubmit,
  additionalMarkdownComponents,
  additionalMarkdownPlugins,
  isAutoScrollEnabledRef,
  isProjectArchived = false,
  setLimitReachedCode,
}: AgentMessageProps) {
  const sId = agentMessage.sId;
  const [streamId, setStreamId] = useState<string>(`message-${sId}`);
  const { hasFeature } = useFeatureFlags();
  const isCollapsibleEnabled = hasFeature("collapsible_messages");
  const hasConsumptionDetails = hasFeature("conversation_consumption_details");

  const [isRetryHandlerProcessing, setIsRetryHandlerProcessing] =
    useState<boolean>(false);

  const [activeReferences, setActiveReferences] = useState<
    { index: number; document: MCPReferenceCitation }[]
  >([]);
  const [isCopied, copy] = useCopyToClipboard();
  const sendNotification = useSendNotification();
  const confirm = useContext(ConfirmContext);

  const { enqueueBlockedAction, removeAllBlockedActionsForMessage } =
    useBlockedActionsContext();

  const { mutateConversationAttachments } = useConversationAttachments({
    conversationId,
    owner,
    options: { disabled: true },
  });
  const { mutateSandboxStatus } = useConversationSandboxStatus({
    conversationId,
    owner,
    options: { disabled: true },
  });
  const { mutateSandboxFiles } = useConversationSandboxFiles({
    conversationId,
    owner,
    options: { disabled: true },
  });

  const methods = useVirtuosoMethods<
    VirtuosoMessage,
    VirtuosoMessageListContext
  >();

  const { agentConfigurations } = useUnifiedAgentConfigurations({
    workspaceId: owner.sId,
  });

  const isTriggeredByCurrentUser = useMemo(
    () => triggeringUser?.sId === user.sId,
    [triggeringUser, user.sId]
  );

  const { shouldStream, streamError } = useAgentMessageStream({
    agentMessage: agentMessage,
    conversationId,
    isAutoScrollEnabledRef,
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
                editableArguments: eventPayload.data.editableArguments,
                messageId: eventPayload.data.messageId,
                metadata: eventPayload.data.metadata,
                stake: eventPayload.data.stake,
                userId: eventPayload.data.userId,
                argumentsRequiringApproval:
                  eventPayload.data.argumentsRequiringApproval,
                approvalArgsLabel: eventPayload.data.approvalArgsLabel,
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

          case "tool_file_auth_required":
            const { fileAuthError } = eventPayload.data;

            enqueueBlockedAction({
              messageId: sId,
              blockedAction: {
                status: "blocked_file_authorization_required",
                actionId: eventPayload.data.actionId,
                fileAuthorizationInfo: {
                  fileId: fileAuthError.fileId,
                  fileName: fileAuthError.fileName,
                  connectionId: fileAuthError.connectionId,
                  mimeType: fileAuthError.mimeType,
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

          case "tool_ask_user_question":
            enqueueBlockedAction({
              messageId: sId,
              blockedAction: {
                status: "blocked_user_answer_required",
                actionId: eventPayload.data.actionId,
                question: eventPayload.data.question,
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

          case "agent_message_success":
          case "agent_message_gracefully_stopped":
            // We can remove all blocked actions for this message (especially useful to let other users see the message updates)
            void removeAllBlockedActionsForMessage({
              messageId: sId,
              conversationId,
            });
            break;
          case "agent_generation_cancelled":
          case "agent_error":
          case "generation_tokens":
            // We can remove all blocked actions for this message (especially useful to let other users see the message updates)
            void removeAllBlockedActionsForMessage({
              messageId: sId,
              conversationId,
            });
            break;
          case "agent_action_success": {
            const action = eventPayload.data.action;
            if (action.generatedFiles.filter((f) => !f.hidden).length > 0) {
              void mutateConversationAttachments();
            }
            if (action.internalMCPServerName === "sandbox") {
              void mutateSandboxStatus();
            }
            if (
              action.internalMCPServerName === "sandbox" ||
              action.generatedFiles.length > 0
            ) {
              void mutateSandboxFiles();
            }
            if (action.internalMCPServerName === "plan_mode") {
              // The conversation-channel `plan_updated` event can be lost (flaky SSE + small replay
              // buffer), leaving the plan card/panel stale until turn end. The tool action rides the
              // reliable per-message stream, so revalidate the plan here for a timely update.
              void mutate(
                planFileKey({ workspaceId: owner.sId, conversationId })
              );
            }
            break;
          }
          case "end-of-stream":
          case "tool_call_started":
          case "tool_error":
          case "tool_notification":
          case "tool_params":
          case "agent_context_pruned":
          case "agent_credit_spend_checkpoint_reached":
            break;
          default:
            assertNeverAndIgnore(eventPayload.data);
        }
      },
      [
        enqueueBlockedAction,
        sId,
        removeAllBlockedActionsForMessage,
        conversationId,
        owner,
        mutateConversationAttachments,
        mutateSandboxStatus,
        mutateSandboxFiles,
      ]
    ),
    streamId,
  });

  const isDeleted = agentMessage.visibility === "deleted";
  const isGracefullyStopped = agentMessage.status === "gracefully_stopped";
  const cancelMessage = useCancelMessage({ owner, conversationId });

  const references = useMemo(
    () =>
      Object.entries(agentMessage.citations ?? {}).reduce<
        Record<string, MCPReferenceCitation>
      >((acc, [ref, citation]) => {
        if (citation) {
          return {
            ...acc,
            [ref]: {
              provider: citation.provider,
              href: citation.href,
              title: citation.title,
              description: citation.description,
              contentType: citation.contentType,
              ref,
            },
          };
        }
        return acc;
      }, {}),
    [agentMessage.citations]
  );

  // GenerationContext: to know if we are generating or not. Destructure the (stable) mutators
  // so the effect below doesn't re-run on every context value change — which happens on every
  // add/remove since the context value ref is tied to the generatingMessages state.
  const {
    addGeneratingMessage,
    removeGeneratingMessage,
    getConversationGeneratingMessages,
  } = useGenerationContext();

  // Once a handoff user message exists for this agent message, the agent has
  // effectively handed over: the child agent owns the generation from here.
  // Treat this message as no longer generating so we don't show duplicate
  // "Stop agent" buttons / streaming affordances alongside the child.
  const isAgentMessageHandingOver = methods.data
    .get()
    .some(
      (m) =>
        isUserMessage(m) &&
        isHandoverUserMessage(m) &&
        m.agenticMessageData?.originMessageId === sId
    );

  useEffect(() => {
    if (shouldStream && !isAgentMessageHandingOver) {
      addGeneratingMessage({
        messageId: sId,
        conversationId,
        agentId: agentMessage.configuration.sId,
      });
    } else {
      removeGeneratingMessage({ messageId: sId });
    }
    // Clean up on unmount so we don't leak a generating entry (e.g. when the message is replaced
    // by a v+1 deletion placeholder mid-stream).
    return () => {
      removeGeneratingMessage({ messageId: sId });
    };
  }, [
    shouldStream,
    isAgentMessageHandingOver,
    addGeneratingMessage,
    removeGeneratingMessage,
    sId,
    conversationId,
    agentMessage.configuration.sId,
  ]);

  const isGlobalAgent = isGlobalAgentId(agentMessage.configuration.sId);

  async function handleCopyToClipboard() {
    if (agentMessage.content === null) {
      datadogLogger.warn(
        {
          messageId: agentMessage.sId,
          conversationId,
          messageStatus: agentMessage.status,
        },
        "handleCopyToClipboard: message content is null"
      );
    }

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

  function handleCopyMessageLink() {
    const messageUrl = `${getConversationRoute(
      owner.sId,
      conversationId,
      undefined,
      config.getAppUrl()
    )}#${agentMessage.sId}`;
    void navigator.clipboard.writeText(messageUrl);
    sendNotification({
      type: "success",
      title: "Message link copied to clipboard",
    });
  }

  const { deleteAgentMessage, isDeleting } = useDeleteAgentMessage({
    owner,
    conversationId,
  });

  const alwaysVisibleButtons: ReactElement[] = [];

  const hasMultiAgents =
    getConversationGeneratingMessages(conversationId).length > 1;

  // Show stop agent button only when streaming with multiple agents
  if (hasMultiAgents && shouldStream) {
    alwaysVisibleButtons.push(
      <Button
        key="stop-msg-button"
        label="Stop agent"
        variant="ghost-secondary"
        size="xs"
        onClick={async () => {
          await cancelMessage([sId]);
        }}
        icon={Stop}
        className="text-muted-foreground"
      />
    );
  }

  const parentAgentMessage = methods.data
    .get()
    .find(
      (m) =>
        isAgentMessageWithStreaming(m) &&
        m.sId === agentMessage.parentAgentMessageId
    );

  const parentAgent =
    parentAgentMessage && isAgentMessageWithStreaming(parentAgentMessage)
      ? parentAgentMessage.configuration
      : null;

  const canDeleteAgentMessage =
    !isDeleted &&
    agentMessage.status !== "created" &&
    isTriggeredByCurrentUser &&
    !isProjectArchived;

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
      if (isAgentMessageWithStreaming(m) && m.sId === agentMessage.sId) {
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

  const shouldShowMessageActions =
    !isDeleted &&
    agentMessage.status !== "created" &&
    agentMessage.status !== "failed";

  const shouldShowRetry =
    !isDeleted &&
    agentMessage.status !== "created" &&
    agentMessage.status !== "failed" &&
    !shouldStream &&
    !isAgentMessageHandingOver &&
    !isProjectArchived;

  const shouldShowFeedback =
    !isDeleted &&
    !isOnboardingConversation &&
    agentMessage.status !== "created" &&
    agentMessage.status !== "failed" &&
    agentMessage.configuration.status !== "draft" &&
    (!isGlobalAgent ||
      (isGlobalAgentId(agentMessage.configuration.sId) &&
        isGlobalAgentWithFeedback(agentMessage.configuration.sId)));

  const retryMessage = useRetryMessage({ owner });
  const { branchConversation, isBranching } = useBranchConversation({
    owner,
    conversationId,
  });

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
      const result = await retryMessage({
        conversationId,
        messageId,
        blockedOnly,
      });
      setIsRetryHandlerProcessing(false);
      if (result.isErr()) {
        setLimitReachedCode?.(result.error);
      }
    },
    [retryMessage, setLimitReachedCode]
  );

  const reloadMessage = useCallback(
    async ({
      conversationId,
      messageId,
    }: {
      conversationId: string;
      messageId: string;
    }) => {
      const response = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}?viewType=light`
      );
      if (response.ok) {
        const msg: FetchConversationMessageResponseLight =
          await response.json();
        // Update the message state from the backend
        methods.data.map((m) => {
          if (
            isLightAgentMessageType(msg.message) &&
            m.sId === msg.message.sId
          ) {
            return makeInitialMessageStreamState(msg.message);
          }
          return m;
        });
        // Force the stream to be re-created if needed
        setStreamId(`message-${msg.message.sId}-${Date.now()}`);
      }
    },
    [owner.sId, methods.data]
  );

  useEffect(() => {
    if (!!streamError) {
      // Hook to the focus event of the document to try reloading the message automatically
      const handleFocus = () => {
        void reloadMessage({ conversationId, messageId: agentMessage.sId });
        window.removeEventListener("focus", handleFocus);
      };
      window.addEventListener("focus", handleFocus);
      return () => {
        window.removeEventListener("focus", handleFocus);
      };
    }
  }, [streamError, reloadMessage, conversationId, agentMessage.sId]);

  // Add feedback buttons.
  if (shouldShowFeedback) {
    alwaysVisibleButtons.push(
      <FeedbackSelector
        key="feedback-selector"
        {...messageFeedback}
        owner={owner}
        agentConfigurationId={agentMessage.configuration.sId}
        agentName={agentMessage.configuration.name}
        isGlobalAgent={isGlobalAgent}
      />
    );
  }

  // Add the remaining footer actions.
  if (shouldShowMessageActions) {
    const dropdownItems: DropdownMenuItemProps[] = [
      {
        label: "Copy message link",
        icon: Link01,
        onSelect: handleCopyMessageLink,
      },
    ];

    dropdownItems.push({
      label: "Branch from here",
      icon: GitBranch01,
      onSelect: () => {
        void branchConversation(agentMessage.sId);
      },
      disabled: isBranching,
    });

    if (shouldShowRetry) {
      dropdownItems.push({
        label: "Retry",
        icon: RefreshCw02,
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
        icon: Trash01,
        onSelect: handleDeleteAgentMessage,
        disabled: isDeleting,
        variant: "warning" as const,
      });
    }

    alwaysVisibleButtons.push(
      <Button
        key="copy-message"
        tooltip={isCopied ? "Copied!" : "Copy to clipboard"}
        variant="ghost-secondary"
        size="xs"
        onClick={handleCopyToClipboard}
        icon={isCopied ? ClipboardCheck : Clipboard}
      />
    );

    if (agentMessage.costCredits !== null && agentMessage.costCredits > 0) {
      const formattedCredits = formatCredits(agentMessage.costCredits);
      const creditCostTrigger = (
        <Button
          variant="ghost-secondary"
          size="xs"
          label={formattedCredits}
          iconRight={CoinsStacked01}
          className="gap-1 px-1 tracking-normal"
          aria-label={`${formatCreditValue(agentMessage.costCredits)} used for this message. View consumption breakdown`}
        />
      );

      alwaysVisibleButtons.push(
        hasConsumptionDetails ? (
          <CreditCostPopover
            key="message-credit-cost"
            credits={agentMessage.costCredits}
            subAgentCredits={agentMessage.subAgentCostCredits}
            conversationId={conversationId}
            messageId={agentMessage.sId}
            workspaceId={owner.sId}
            trigger={creditCostTrigger}
          />
        ) : (
          <span
            key="message-credit-cost"
            role="status"
            aria-label={`${formatCreditValue(agentMessage.costCredits)} used for this message`}
            className="inline-flex h-6 items-center gap-1 rounded-lg px-1 text-sm font-medium leading-5 text-muted-foreground"
          >
            {formattedCredits}
            <CoinsStacked01 className="h-4 w-4" />
          </span>
        )
      );
    }

    alwaysVisibleButtons.push(
      <DropdownMenu key="message-actions">
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost-secondary"
            size="xs"
            icon={DotsHorizontal}
            aria-label="More message actions"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {dropdownItems.map((item, index) => (
            <DropdownMenuItem key={index} {...item} />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const { configuration: agentConfiguration } = agentMessage;

  const citations = useMemo(
    () => getCitations({ activeReferences, owner, conversationId }),
    [activeReferences, conversationId, owner]
  );

  const handleQuickReply = useCallback(
    async (reply: string) => {
      const parsedMention = extractFromString(reply).find(isAgentMention);
      const matchedAgent = parsedMention
        ? agentConfigurations.find(
            (a) => a.sId === parsedMention.configurationId
          )
        : undefined;
      const currentAgent = agentConfigurations.find(
        (a) => a.sId === agentMessage.configuration.sId
      );
      const resolvedConfig = matchedAgent ?? currentAgent;
      const mention: RichAgentMention = resolvedConfig
        ? toRichAgentMentionType(resolvedConfig)
        : {
            id: agentMessage.configuration.sId,
            type: "agent",
            label: agentMessage.configuration.name,
            pictureUrl: agentMessage.configuration.pictureUrl,
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
    [
      agentConfigurations,
      agentMessage.configuration,
      handleSubmit,
      sendNotification,
    ]
  );

  const canMention =
    agentConfiguration.canRead &&
    canShowAgentConversationActions(agentConfiguration.sId);
  const isArchived = agentConfiguration.status === "archived";

  const perMessageModel =
    agentMessage.modelResolutionMethod === "user" && agentMessage.resolvedModel
      ? getSupportedModelConfig(agentMessage.resolvedModel)
      : null;
  const perMessageModelLabel =
    perMessageModel && agentMessage.resolvedModel
      ? getModelWithReasoningEffortLabel({
          kind: "model",
          model: perMessageModel,
          effort: agentMessage.resolvedModel.reasoningEffort,
        })
      : null;

  const isFairUseDowngrade =
    agentMessage.modelResolutionMethod === "fair_use_downgrade";

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
        {perMessageModelLabel && (
          <Tooltip
            label="Model was overridden for this message using the model picker."
            tooltipTriggerAsChild
            trigger={
              <span className="pl-1 font-normal text-muted-foreground">
                with {perMessageModelLabel}
              </span>
            }
          />
        )}
        {parentAgent && (
          <Chip
            label={`handoff from ${parentAgent.name}`}
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
      perMessageModelLabel,
      parentAgent,
      agentMessage.status,
    ]
  );

  const timestamp = parentAgent
    ? undefined
    : formatTimestring(agentMessage.completedTs ?? agentMessage.created);

  const messageContent = (
    <ConversationMessageContent
      citations={isDeleted || uiView === "compact" ? undefined : citations}
      type="agent"
    >
      {isDeleted ? (
        <DeletedMessage />
      ) : (
        <AgentMessageContent
          onOpenDetails={onCompletionStatusClick}
          onQuickReplySend={handleQuickReply}
          owner={owner}
          conversationId={conversationId}
          spaceId={spaceId}
          retryHandler={retryHandler}
          reloadMessage={reloadMessage}
          isRetryHandlerProcessing={isRetryHandlerProcessing}
          isLastMessage={isLastMessage}
          agentMessage={agentMessage}
          references={references}
          streaming={shouldStream}
          streamError={streamError}
          activeReferences={activeReferences}
          setActiveReferences={setActiveReferences}
          triggeringUser={triggeringUser}
          isAgentMessageHandingOver={isAgentMessageHandingOver}
          additionalMarkdownComponents={additionalMarkdownComponents}
          additionalMarkdownPlugins={additionalMarkdownPlugins}
          uiView={uiView}
        />
      )}
    </ConversationMessageContent>
  );

  const footerButtons = !isDeleted &&
    !isGracefullyStopped &&
    alwaysVisibleButtons.length > 0 && (
      <div className="flex items-center gap-1">{alwaysVisibleButtons}</div>
    );

  const renderMessageContent = () => {
    if (isCollapsibleEnabled && !shouldStream) {
      return (
        <TruncatedContent
          className="flex flex-col gap-5"
          defaultCollapsed={!isLastMessage}
          footer={footerButtons}
          buttonClassName="text-muted-foreground"
        >
          {messageContent}
        </TruncatedContent>
      );
    }

    return (
      <div className="flex flex-col gap-5">
        {messageContent}
        {footerButtons}
      </div>
    );
  };

  return (
    <ConversationMessageContainer messageType="agent" type="agent">
      {!hideHeader && (
        <div className="inline-flex items-center gap-2">
          <ConversationMessageAvatar
            avatarUrl={agentConfiguration.pictureUrl}
            name={agentConfiguration.name}
            isBusy={agentMessage.status === "created"}
            isDisabled={isArchived}
            type="agent"
          />
          <ConversationMessageTitle
            name={agentConfiguration.name}
            timestamp={timestamp}
            infoChip={
              isFairUseDowngrade ? (
                <PremiumDowngradeChip />
              ) : agentMessage.prunedContext ? (
                <PrunedContextChip />
              ) : undefined
            }
            completionStatus={undefined}
            renderName={renderName}
          />
        </div>
      )}

      <div className="group flex w-full min-w-0 flex-col gap-2">
        {renderMessageContent()}
      </div>
    </ConversationMessageContainer>
  );
}

function AgentMessageContent({
  onOpenDetails,
  triggeringUser,
  isLastMessage,
  agentMessage,
  references,
  streaming,
  streamError,
  owner,
  conversationId,
  spaceId,
  activeReferences,
  setActiveReferences,
  retryHandler,
  reloadMessage,
  isRetryHandlerProcessing,
  onQuickReplySend,
  isAgentMessageHandingOver,
  additionalMarkdownComponents: propsAdditionalMarkdownComponents,
  additionalMarkdownPlugins,
  uiView,
}: {
  onOpenDetails?: (messageId: string, actionId?: string) => void;
  triggeringUser: UserType | null;
  isLastMessage: boolean;
  owner: LightWorkspaceType;
  conversationId: string;
  spaceId: string | null;
  retryHandler: (params: {
    conversationId: string;
    messageId: string;
    blockedOnly?: boolean;
  }) => Promise<void>;
  reloadMessage: (params: {
    conversationId: string;
    messageId: string;
  }) => Promise<void>;
  isRetryHandlerProcessing: boolean;
  agentMessage: AgentMessageWithStreaming;
  references: { [key: string]: MCPReferenceCitation };
  streaming: boolean;
  streamError: Error | null;
  activeReferences: { index: number; document: MCPReferenceCitation }[];
  setActiveReferences: React.Dispatch<
    React.SetStateAction<{ index: number; document: MCPReferenceCitation }[]>
  >;
  onQuickReplySend: (message: string) => Promise<void>;
  // True once a handoff user message pointing to this agent message exists —
  // the child agent owns generation from that point, so this message should
  // collapse its inline activity (no more "Thinking…") and drop its stop button.
  isAgentMessageHandingOver: boolean;
  additionalMarkdownComponents?: Components;
  additionalMarkdownPlugins?: PluggableList;
  uiView: UiView;
}) {
  const methods = useVirtuosoMethods<
    VirtuosoMessage,
    VirtuosoMessageListContext
  >();

  const { vizUrl } = useAuth();
  const { sId, configuration: agentConfiguration } = agentMessage;

  const { postFollowUp } = usePostOnboardingFollowUp({
    workspaceId: owner.sId,
    conversationId,
  });

  const { getFirstBlockedActionForMessage } = useBlockedActionsContext();

  const blockedAction = getFirstBlockedActionForMessage(sId);

  // The persisted flag survives a refresh; the streamed one is only there for instant feedback
  // right when the pause happens, ahead of the persisted flag catching up.
  const [workflowAlertThresholdResolved, setWorkflowAlertThresholdResolved] =
    useState(false);
  const showWorkflowAlertThresholdPausedCard =
    !workflowAlertThresholdResolved &&
    (agentMessage.pausedAtWorkflowAlertThreshold ||
      !!agentMessage.workflowAlertThresholdCrossed) &&
    agentMessage.status === "created";

  const { resolve: resolveWorkflowAlertThreshold, submittingDecision } =
    useResolveWorkflowAlertThresholdPause({
      owner,
      conversationId,
      messageId: sId,
    });

  const handleResolveWorkflowAlertThreshold = useCallback(
    async (decision: "continue" | "decline") => {
      const { success } = await resolveWorkflowAlertThreshold(decision);
      if (success) {
        setWorkflowAlertThresholdResolved(true);
      }
    },
    [resolveWorkflowAlertThreshold]
  );

  const workflowAlertThresholdPausedElement =
    showWorkflowAlertThresholdPausedCard ? (
      <WorkflowAlertThresholdPausedCard
        thresholdAwuCredits={
          agentMessage.workflowAlertThresholdCrossed?.thresholdAwuCredits ??
          null
        }
        submittingDecision={submittingDecision}
        onContinue={() => void handleResolveWorkflowAlertThreshold("continue")}
        onDecline={() => void handleResolveWorkflowAlertThreshold("decline")}
      />
    ) : null;

  const retryHandlerWithResetState = useCallback(
    // Conversation and message might be different than the current ones in case of subagents.
    async (conversationAndMessage: {
      conversationId: string;
      messageId: string;
    }) => {
      methods.data.map((m) =>
        isAgentMessageWithStreaming(m) && m.sId === sId
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
  const updateActiveReferences = useCallback(
    (document: MCPReferenceCitation, index: number) => {
      setActiveReferences((prev) => {
        if (prev.some((r) => r.index === index)) {
          return prev;
        }
        return [...prev, { index, document }];
      });
    },
    [setActiveReferences]
  );

  const citationsContextValue = useMemo(
    () => ({ references, updateActiveReferences }),
    [references, updateActiveReferences]
  );

  const handleToolSetupComplete = useCallback(
    (toolId: string) => {
      void postFollowUp(toolId);
    },
    [postFollowUp]
  );

  const additionalMarkdownComponents: Components = useMemo(
    () => ({
      visualization: getVisualizationPlugin(
        owner,
        agentConfiguration.sId,
        conversationId,
        sId,
        vizUrl,
        spaceId
      ),
      sup: CiteBlock,
      quickReply: getQuickReplyPlugin(onQuickReplySend, isLastMessage),
      toolSetup: getToolSetupPlugin(owner, handleToolSetupComplete),
      action_card: getActionCardPlugin(onQuickReplySend, isLastMessage),
      ...propsAdditionalMarkdownComponents,
    }),
    [
      owner,
      conversationId,
      sId,
      agentConfiguration.sId,
      vizUrl,
      onQuickReplySend,
      isLastMessage,
      handleToolSetupComplete,
      propsAdditionalMarkdownComponents,
      spaceId,
    ]
  );

  const { interactiveFiles } = useAutoOpenSidePanel({
    agentMessage,
    isLastMessage,
  });

  const blockedActionElement = blockedAction ? (
    <BlockedAction
      // Key on the action id so that when the queue advances to the next
      // blocked action of the same type, React mounts a fresh component
      // instead of reusing the previous instance's local state (e.g. the
      // "connected" state of a resolved personal authentication card).
      key={blockedAction.actionId}
      blockedAction={blockedAction}
      triggeringUser={triggeringUser}
      owner={owner}
      conversationId={conversationId}
      retryHandler={retryHandlerWithResetState}
    />
  ) : null;

  if (agentMessage.status === "created" && !!streamError) {
    return (
      <ErrorMessage
        error={{
          message:
            "Connection lost while generating message. Please try again.",
          code: "stream_error",
          metadata: {},
        }}
        retryHandler={() =>
          reloadMessage({ conversationId, messageId: agentMessage.sId })
        }
      />
    );
  }

  // Extract file IDs already referenced inline (to avoid duplicate rendering).
  // Match file IDs only in markdown IMAGE syntax: ![...](url containing fil_XXX)
  // NOT plain text mentions or links, to avoid filtering out images from the grid.
  const markdownImageRegex = new RegExp(
    `!\\[.*?\\]\\([^)]*?(${FILE_ID_PATTERN})[^)]*?\\)`,
    "g"
  );
  const matches = (agentMessage.content ?? "").matchAll(markdownImageRegex);
  const referencedFileIds = new Set([...matches].map((m) => m[1]));
  const referencedFilePaths = getFilePreviewDirectivePaths(
    agentMessage.content ?? ""
  );

  // Get completed images that are not already referenced in the Markdown content.
  // Combine from actions (updated during streaming) and generatedFiles (available on reload).
  const filesFromActions = agentMessage.actions.flatMap((action) =>
    action.generatedFiles.filter((f) => !f.hidden)
  );
  const filesFromMessage = agentMessage.generatedFiles.filter((f) => !f.hidden);

  // Combine both sources, preferring actions (more up-to-date during streaming).
  // Dedupe by fileId (file resource) or filePath (file path).
  const seenFileKeys = new Set<string>();
  const allGeneratedFiles = [...filesFromActions, ...filesFromMessage].filter(
    (file) => {
      const key = file.fileId ?? file.filePath;
      if (!key || seenFileKeys.has(key)) {
        return false;
      }
      seenFileKeys.add(key);
      return true;
    }
  );

  const completedImages = allGeneratedFiles
    .filter((file) => isSupportedImageContentType(file.contentType))
    .filter((file) => file.fileId && !referencedFileIds.has(file.fileId));

  const inProgressImageCount = Array.from(
    agentMessage.streaming.actionProgress.values()
  ).filter(({ progress }) => {
    const output = progress?._meta?.data?.output;
    return output !== undefined && isImageProgressOutput(output);
  }).length;

  const allImages = [
    ...completedImages.map((image) => ({
      imageUrl: `${config.getApiBaseUrl()}/api/w/${owner.sId}/files/${image.fileId}?action=view&version=processed`,
      downloadUrl: `${config.getApiBaseUrl()}/api/w/${owner.sId}/files/${image.fileId}?action=download`,
      alt: image.title,
      title: image.title,
      isLoading: false,
    })),
    ...Array.from({ length: inProgressImageCount }, (_, i) => ({
      imageUrl: "",
      alt: `Generating image ${i + 1}`,
      title: `Generating image ${i + 1}`,
      isGenerating: true,
    })),
  ];

  const generatedFiles = filesFromMessage.filter(
    (file) =>
      !isSupportedImageContentType(file.contentType) &&
      !isFrameContentType(file.contentType) &&
      (file.filePath === undefined || !referencedFilePaths.has(file.filePath))
  );

  return (
    <CitationsContext.Provider value={citationsContextValue}>
      <div className="flex flex-col gap-y-4">
        <InlineActivitySteps
          agentMessage={agentMessage}
          lastAgentStateClassification={
            isAgentMessageHandingOver
              ? "done"
              : agentMessage.streaming.agentState
          }
          completedSteps={agentMessage.streaming.inlineActivitySteps}
          pendingToolCalls={agentMessage.streaming.pendingToolCalls}
          onOpenDetails={onOpenDetails}
          owner={owner}
          isLastMessage={isLastMessage}
        />
        {blockedActionElement}
        {workflowAlertThresholdPausedElement}
        <AgentMessageInteractiveContentGeneratedFiles
          files={interactiveFiles}
          collapsible={uiView === "compact"}
        />
        {allImages.length > 0 && <InteractiveImageGrid images={allImages} />}

        {agentMessage.content !== null &&
          agentMessage.content !== "" &&
          agentMessage.streaming.agentState === "done" && (
            <div>
              <AgentMessageMarkdown
                content={sanitizeVisualizationContent(agentMessage.content)}
                owner={owner}
                streamingState={
                  agentMessage.status === "cancelled" ? "cancelled" : "none"
                }
                isLastMessage={isLastMessage}
                additionalMarkdownComponents={additionalMarkdownComponents}
                additionalMarkdownPlugins={additionalMarkdownPlugins}
              />
            </div>
          )}
        {uiView !== "compact" && generatedFiles.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2 @xs:grid-cols-3 @sm:grid-cols-4 @md:grid-cols-5">
            {generatedFiles.map((file) => (
              <ToolGeneratedFileDetails
                key={
                  file.fileId ??
                  ("filePath" in file ? file.filePath : file.title)
                }
                resource={file}
              />
            ))}
          </div>
        )}
        {/*
         * Cancelled messages render the standard message footer (feedback + full menu,
         * including Retry), so we only show the "Generation stopped." note here.
         */}
        {agentMessage.status === "cancelled" && (
          <div className="text-sm text-faint">Generation stopped.</div>
        )}
        {agentMessage.status === "interrupted" && (
          <div className="flex flex-col gap-2">
            <div className="text-sm text-faint">
              Skipped. Running your next message.
            </div>
            <div>
              <ButtonGroupDropdown
                trigger={
                  <Button
                    variant="outline"
                    size="xs"
                    icon={DotsHorizontal}
                    className="text-muted-foreground"
                  />
                }
                items={[
                  {
                    label: "Retry",
                    icon: RefreshCw02,
                    onSelect: () => {
                      void retryHandler({
                        conversationId,
                        messageId: agentMessage.sId,
                      });
                    },
                    disabled: isRetryHandlerProcessing,
                  },
                ]}
                align="end"
              />
            </div>
          </div>
        )}
        {agentMessage.status === "failed" && (
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
        )}
      </div>
    </CitationsContext.Provider>
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
        size="sm"
      />
    );
  });
}
