import {
  ArrowPathIcon, Avatar,
  Button,
  Chip,
  ClipboardCheckIcon,
  ClipboardIcon,
  CollapsibleComponent,
  ConversationMessage,
  DocumentIcon, Icon,
  InteractiveImageGrid,
  Markdown,
  Separator,
  Spinner,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { marked } from "marked";
import React from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

import { MCPActionDetails } from "@app/components/actions/mcp/details/MCPActionDetails";
import { ActionValidationContext } from "@app/components/assistant/conversation/ActionValidationProvider";
import {
  DefaultAgentMessageGeneratedFiles,
  InteractiveAgentMessageGeneratedFiles,
} from "@app/components/assistant/conversation/AgentMessageGeneratedFiles";
import { AssistantHandle } from "@app/components/assistant/conversation/AssistantHandle";
import { useAutoOpenInteractiveContent } from "@app/components/assistant/conversation/content/useAutoOpenInteractiveContent";
import { ErrorMessage } from "@app/components/assistant/conversation/ErrorMessage";
import type { FeedbackSelectorProps } from "@app/components/assistant/conversation/FeedbackSelector";
import { FeedbackSelector } from "@app/components/assistant/conversation/FeedbackSelector";
import { FeedbackSelectorPopoverContent } from "@app/components/assistant/conversation/FeedbackSelectorPopoverContent";
import { GenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import { MCPServerPersonalAuthenticationRequired } from "@app/components/assistant/conversation/MCPServerPersonalAuthenticationRequired";
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
import { useEventSource } from "@app/hooks/useEventSource";
import type { MCPActionType } from "@app/lib/actions/mcp";
import type { ProgressNotificationContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isImageProgressOutput } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { MCP_SPECIFICATION } from "@app/lib/actions/utils";
import type {
  AgentMessageStateEvent,
  MessageTemporaryState,
  StreamingBlock,
} from "@app/lib/assistant/state/messageReducer";
import {
  CLEAR_CONTENT_EVENT,
  messageReducer,
} from "@app/lib/assistant/state/messageReducer";
import { useConversationMessage } from "@app/lib/swr/conversations";
import type {
  LightAgentMessageType,
  UserType,
  WorkspaceType,
} from "@app/types";
import {
  assertNever,
  GLOBAL_AGENTS_SID,
  isInteractiveFileContentType,
  isOAuthProvider,
  isSupportedImageContentType,
  isValidScope,
} from "@app/types";

interface AgentMessageProps {
  conversationId: string;
  isLastMessage: boolean;
  message: LightAgentMessageType;
  messageFeedback: FeedbackSelectorProps;
  owner: WorkspaceType;
  user: UserType;
}

type AgentMessageStateWithControlEvent =
  | AgentMessageStateEvent
  | { type: "end-of-stream" };

function makeInitialMessageStreamState(
  message: LightAgentMessageType
): MessageTemporaryState {
  // Initialize streaming blocks from existing message data
  const blocks: StreamingBlock[] = [];

  // Add existing chain of thought as a completed thinking block
  if (message.chainOfThought) {
    blocks.push({
      type: "thinking",
      content: message.chainOfThought,
      isStreaming: false,
    });
  }

  // Add existing actions as completed action blocks
  message.actions.forEach((action) => {
    blocks.push({
      type: "action",
      action: action as MCPActionType,
      status: message.status === "failed" ? "failed" : "succeeded",
    });
  });

  return {
    actionProgress: new Map(),
    agentState: message.status === "created" ? "thinking" : "done",
    isRetrying: false,
    lastUpdated: new Date(),
    message,
    streamingBlocks: blocks,
    currentStreamingContent: null,
    currentStreamingType: null,
  };
}

/**
 *
 * @param isInModal is the conversation happening in a side modal, i.e. when
 * testing an agent? see conversation/Conversation.tsx
 * @returns
 */
export function AgentMessage({
  conversationId,
  isLastMessage,
  message,
  messageFeedback,
  owner,
}: AgentMessageProps) {
  const { isDark } = useTheme();

  const [messageStreamState, dispatch] = React.useReducer(
    messageReducer,
    message,
    makeInitialMessageStreamState
  );

  const shouldStream = React.useMemo(() => {
    if (message.status !== "created") {
      return false;
    }

    switch (messageStreamState.message.status) {
      case "succeeded":
      case "failed":
      case "cancelled":
        return false;
      case "created":
        return true;
      default:
        assertNever(messageStreamState.message.status);
    }
  }, [message.status, messageStreamState.message.status]);

  const [isRetryHandlerProcessing, setIsRetryHandlerProcessing] =
    React.useState<boolean>(false);

  const [activeReferences, setActiveReferences] = React.useState<
    { index: number; document: MarkdownCitation }[]
  >([]);
  const [isCopied, copy] = useCopyToClipboard();

  const isGlobalAgent = Object.values(GLOBAL_AGENTS_SID).includes(
    message.configuration.sId as GLOBAL_AGENTS_SID
  );

  // Track if this is a fresh mount (no lastEventId) with existing content
  const isFreshMountWithContent = React.useRef(
    message.status === "created" &&
      (!!message.content || !!message.chainOfThought)
  );

  const buildEventSourceURL = React.useCallback(
    (lastEvent: string | null) => {
      const esURL = `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${message.sId}/events`;
      let lastEventId = "";
      if (lastEvent) {
        const eventPayload: {
          eventId: string;
        } = JSON.parse(lastEvent);
        lastEventId = eventPayload.eventId;
        // We have a lastEventId, so this is not a fresh mount
        isFreshMountWithContent.current = false;
      }
      const url = esURL + "?lastEventId=" + lastEventId;

      return url;
    },
    [conversationId, message.sId, owner.sId]
  );

  const { showValidationDialog } = React.useContext(ActionValidationContext);

  const { mutateMessage } = useConversationMessage({
    conversationId,
    workspaceId: owner.sId,
    messageId: message.sId,
    options: { disabled: true },
  });

  const onEventCallback = React.useCallback(
    (eventStr: string) => {
      const eventPayload: {
        eventId: string;
        data: AgentMessageStateWithControlEvent;
      } = JSON.parse(eventStr);
      const eventType = eventPayload.data.type;

      // Handle validation dialog separately.
      if (eventType === "tool_approve_execution") {
        showValidationDialog({
          messageId: eventPayload.data.messageId,
          conversationId: eventPayload.data.conversationId,
          actionId: eventPayload.data.actionId,
          inputs: eventPayload.data.inputs,
          stake: eventPayload.data.stake,
          metadata: eventPayload.data.metadata,
          // TODO(MCP 2025-06-09): Remove this once all extensions are updated.
          action: eventPayload.data.action,
        });

        return;
      }

      // This event is emitted in front/lib/api/assistant/pubsub.ts. Its purpose is to signal the
      // end of the stream to the client. The message reducer does not, and should not, handle this
      // event, so we just return.
      if (eventType === "end-of-stream") {
        return;
      }

      // If this is a fresh mount with existing content and we're getting generation_tokens,
      // we need to clear the content first to avoid duplication
      if (
        isFreshMountWithContent.current &&
        eventType === "generation_tokens" &&
        (eventPayload.data.classification === "tokens" ||
          eventPayload.data.classification === "chain_of_thought")
      ) {
        // Clear the existing content from the state
        dispatch(CLEAR_CONTENT_EVENT);
        isFreshMountWithContent.current = false;
      }

      const shouldRefresh = [
        "agent_action_success",
        "agent_error",
        "agent_message_success",
        "agent_generation_cancelled",
      ].includes(eventType);

      if (shouldRefresh) {
        void mutateMessage();
      }

      dispatch(eventPayload.data);
    },
    [showValidationDialog, mutateMessage]
  );

  useEventSource(
    buildEventSourceURL,
    onEventCallback,
    `message-${message.sId}`,
    { isReadyToConsumeStream: shouldStream }
  );

  const agentMessageToRender = ((): LightAgentMessageType => {
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
  })();

  const references = Object.entries(
    agentMessageToRender.citations ?? {}
  ).reduce<Record<string, MarkdownCitation>>((acc, [key, citation]) => {
    if (citation) {
      const IconComponent = getCitationIcon(citation.provider, isDark);
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
  }, {});

  // Autoscroll is performed when a message is generating and the page is
  // already scrolled down; but if the user has scrolled the page up after the
  // start of the message, we do not want to scroll it back down.
  //
  // Checking the conversation is already at the bottom of the screen is done
  // modulo a small margin (50px). This value is small because if large, it
  // prevents user from scrolling up when the message continues generating
  // (forces it back down), but it cannot be zero otherwise the scroll does not
  // happen.
  const isAtBottom = React.useRef(true);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        isAtBottom.current = entry.isIntersecting;
      },
      { threshold: 1 }
    );

    const currentBottomRef = bottomRef.current;

    if (currentBottomRef) {
      observer.observe(currentBottomRef);
    }

    return () => {
      if (currentBottomRef) {
        observer.unobserve(currentBottomRef);
      }
    };
  }, []);

  // GenerationContext: to know if we are generating or not.
  const generationContext = React.useContext(GenerationContext);
  if (!generationContext) {
    throw new Error(
      "AgentMessage must be used within a GenerationContextProvider"
    );
  }
  React.useEffect(() => {
    const isInArray = generationContext.generatingMessages.some(
      (m) => m.messageId === message.sId
    );
    if (agentMessageToRender.status === "created" && !isInArray) {
      generationContext.setGeneratingMessages((s) => [
        ...s,
        { messageId: message.sId, conversationId },
      ]);
    } else if (agentMessageToRender.status !== "created" && isInArray) {
      generationContext.setGeneratingMessages((s) =>
        s.filter((m) => m.messageId !== message.sId)
      );
    }
  }, [
    agentMessageToRender.status,
    generationContext,
    message.sId,
    conversationId,
  ]);

  // Auto-open interactive content drawer when interactive files are available.
  const { interactiveFiles } = useAutoOpenInteractiveContent({
    messageStreamState,
    agentMessageToRender,
    isLastMessage,
  });

  const PopoverContent = React.useCallback(
    () => (
      <FeedbackSelectorPopoverContent
        owner={owner}
        agentMessageToRender={agentMessageToRender}
      />
    ),
    [owner, agentMessageToRender]
  );

  async function handleCopyToClipboard() {
    const messageContent = agentMessageToRender.content || "";
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

  const buttons =
    message.status === "failed" || messageStreamState.agentState === "thinking"
      ? []
      : [
          <Button
            key="copy-msg-button"
            tooltip={isCopied ? "Copied!" : "Copy to clipboard"}
            variant="outline"
            size="xs"
            onClick={handleCopyToClipboard}
            icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
            className="text-muted-foreground"
          />,
          <Button
            key="retry-msg-button"
            tooltip="Retry"
            variant="outline"
            size="xs"
            onClick={() => {
              void retryHandler(agentMessageToRender);
            }}
            icon={ArrowPathIcon}
            className="text-muted-foreground"
            disabled={isRetryHandlerProcessing || shouldStream}
          />,
          // One cannot leave feedback on global agents.
          ...(isGlobalAgent ||
          agentMessageToRender.configuration.status === "draft"
            ? []
            : [
                <Separator key="separator" orientation="vertical" />,
                <FeedbackSelector
                  key="feedback-selector"
                  {...messageFeedback}
                  getPopoverInfo={PopoverContent}
                />,
              ]),
        ];

  // References logic.
  function updateActiveReferences(document: MarkdownCitation, index: number) {
    const existingIndex = activeReferences.find((r) => r.index === index);
    if (!existingIndex) {
      setActiveReferences([...activeReferences, { index, document }]);
    }
  }

  const { configuration: agentConfiguration } = agentMessageToRender;

  const additionalMarkdownComponents: Components = React.useMemo(
    () => ({
      visualization: getVisualizationPlugin(
        owner,
        agentConfiguration.sId,
        conversationId,
        message.sId
      ),
      sup: CiteBlock,
      mention: getMentionPlugin(owner),
      dustimg: getImgPlugin(owner),
    }),
    [owner, conversationId, message.sId, agentConfiguration.sId]
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

  const citations = React.useMemo(
    () => getCitations({ activeReferences }),
    [activeReferences]
  );

  const canMention = agentConfiguration.canRead;
  const isArchived = agentConfiguration.status === "archived";

  // Inline thinking component - always visible with subtle background
  const InlineThought = ({
    content,
    isStreaming,
  }: {
    content: string;
    isStreaming: boolean;
  }) => {
    return (
      <div className="bg-structure-50/50 rounded-lg p-4">
        <div className="flex items-start gap-2">
          {isStreaming && (
            <div className="mt-1">
              <Spinner size="xs" />
            </div>
          )}
          <div className="text-element-600 flex-1 text-sm">
            <Markdown
              content={content}
              isStreaming={isStreaming}
              forcedTextSize="text-sm"
              isLastMessage={false}
            />
          </div>
        </div>
      </div>
    );
  };

  // Collapsible component for actions
  const CollapsibleActionDetails = ({
    action,
    owner,
    lastNotification,
    messageStatus,
  }: {
    action: MCPActionType;
    owner: WorkspaceType;
    lastNotification: ProgressNotificationContentType | null;
    messageStatus?: "created" | "succeeded" | "failed" | "cancelled";
  }) => {
    const isRunning = messageStatus === "created";
    const hasCompleted = messageStatus === "succeeded";
    const hasFailed = messageStatus === "failed";

    // Get a readable tool name from the function call name
    const getToolDisplayName = () => {
      if (!action.functionCallName) {
        return "Tool";
      }

      // Remove namespace prefix if present (e.g., "dust_search__search" -> "search")
      const parts = action.functionCallName.split("__");
      const toolName = parts[parts.length - 1];

      // Common tool name mappings
      const toolDisplayNames: Record<string, string> = {
        search: "Search",
        include: "Include Data",
        websearch: "Web Search",
        webbrowser: "Browse Web",
        query_tables: "Query Tables",
        get_database_schema: "Get Database Schema",
        execute_database_query: "Execute Query",
        process: "Process Data",
        run_agent: "Run Agent",
        filesystem_list: "List Files",
        filesystem_find: "Find Files",
        filesystem_cat: "Read File",
        filesystem_locate_in_tree: "Locate in Tree",
      };

      return (
        toolDisplayNames[toolName] ||
        toolName.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
      );
    };

    const toolDisplayName = getToolDisplayName();
    const IconComponent = MCP_SPECIFICATION.cardIcon;

    return (
      <div className="border-structure-100 bg-structure-50/30 overflow-hidden rounded-lg border">
        <CollapsibleComponent
          rootProps={{ defaultOpen: isRunning }}
          triggerChildren={
            <div className="hover:bg-structure-50/50 flex items-center gap-2 p-3 transition-colors">
              <div className="flex-shrink-0">
                <IconComponent className="text-element-600 h-4 w-4" />
              </div>
              {isRunning && <Spinner size="xs" />}
              {hasCompleted && (
                <div className="text-sm font-medium text-success-500">✓</div>
              )}
              {hasFailed && (
                <div className="text-sm font-medium text-warning-500">✗</div>
              )}
              <Avatar
                size="sm"
                visual={<Icon visual={visual} />}
                backgroundColor="bg-muted-background dark:bg-muted-background-night"
              />
              <span className="heading-base">{actionName}</span>
              {action.params?.query && (
                <span className="text-element-500 flex-1 truncate text-sm">
                  "{String(action.params.query).substring(0, 50)}
                  {String(action.params.query).length > 50 ? "..." : ""}"
                </span>
              )}
            </div>
          }
          contentChildren={
            <div className="border-structure-100 border-t p-3">
              <MCPActionDetails
                viewType="conversation"
                action={action}
                owner={owner}
                lastNotification={lastNotification}
                messageStatus={messageStatus}
              />
            </div>
          }
        />
      </div>
    );
  };

  return (
    <ConversationMessage
      pictureUrl={agentConfiguration.pictureUrl}
      name={agentConfiguration.name}
      buttons={buttons}
      avatarBusy={agentMessageToRender.status === "created"}
      isDisabled={isArchived}
      renderName={() => (
        <AssistantHandle
          assistant={{
            sId: agentConfiguration.sId,
            name: agentConfiguration.name + (isArchived ? " (archived)" : ""),
          }}
          canMention={canMention}
          isDisabled={isArchived}
        />
      )}
      type="agent"
      citations={citations}
    >
      <div>
        {renderAgentMessage({
          agentMessage: agentMessageToRender,
          references: references,
          streaming: shouldStream,
          lastTokenClassification:
            messageStreamState.agentState === "thinking" ? "tokens" : null,
        })}
      </div>
      {/* Invisible div to act as a scroll anchor for detecting when the user has scrolled to the bottom */}
      <div ref={bottomRef} className="h-1.5" />
    </ConversationMessage>
  );

  function renderAgentMessage({
    agentMessage,
    references,
    streaming,
    lastTokenClassification,
  }: {
    agentMessage: LightAgentMessageType;
    references: { [key: string]: MarkdownCitation };
    streaming: boolean;
    lastTokenClassification: null | "tokens" | "chain_of_thought";
  }) {
    if (agentMessage.status === "failed") {
      if (
        agentMessage.error &&
        agentMessage.error.code ===
          "mcp_server_personal_authentication_required" &&
        typeof agentMessage.error.metadata?.mcp_server_id === "string" &&
        agentMessage.error.metadata?.mcp_server_id.length > 0 &&
        isOAuthProvider(agentMessage.error.metadata?.provider) &&
        isValidScope(agentMessage.error.metadata?.scope)
      ) {
        return (
          <MCPServerPersonalAuthenticationRequired
            owner={owner}
            mcpServerId={agentMessage.error.metadata.mcp_server_id}
            provider={agentMessage.error.metadata.provider}
            scope={agentMessage.error.metadata.scope}
            retryHandler={async () => retryHandler(agentMessage)}
          />
        );
      }
      return (
        <ErrorMessage
          error={
            agentMessage.error || {
              message: "Unexpected Error",
              code: "unexpected_error",
              metadata: {},
            }
          }
          retryHandler={async () => retryHandler(agentMessage)}
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
    const completedImages = messageStreamState.message.generatedFiles.filter(
      (file) => isSupportedImageContentType(file.contentType)
    );

    const generatedFiles = agentMessage.generatedFiles.filter(
      (file) =>
        !isSupportedImageContentType(file.contentType) &&
        !isInteractiveFileContentType(file.contentType)
    );

    return (
      <div className="flex flex-col gap-y-4">
        {/* Render all streaming blocks in order */}
        {messageStreamState.streamingBlocks.map((block, index) => {
          if (block.type === "thinking") {
            return (
              <InlineThought
                key={`thinking-${index}`}
                content={block.content}
                isStreaming={block.isStreaming}
              />
            );
          } else if (block.type === "action") {
            const lastNotification =
              messageStreamState.actionProgress.get(block.action.id)
                ?.progress ?? null;
            return (
              <CollapsibleActionDetails
                key={`action-${block.action.id}`}
                action={block.action}
                owner={owner}
                lastNotification={lastNotification}
                messageStatus={block.status}
              />
            );
          }
          return null;
        })}

        <InteractiveAgentMessageGeneratedFiles files={interactiveFiles} />
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
                  isStreaming={
                    streaming && lastTokenClassification === "tokens"
                  }
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

  async function retryHandler(agentMessage: LightAgentMessageType) {
    setIsRetryHandlerProcessing(true);
    await fetch(
      `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${agentMessage.sId}/retry`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    setIsRetryHandlerProcessing(false);
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
