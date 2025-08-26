import {
  ArrowPathIcon,
  Button,
  Chip,
  ClipboardCheckIcon,
  ClipboardIcon,
  ConversationMessage,
  DocumentIcon,
  InteractiveImageGrid,
  Markdown,
  Separator,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { marked } from "marked";
import React, { useCallback } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

import { AgentMessageActions } from "@app/components/assistant/conversation/actions/AgentMessageActions";
import { useActionValidationContext } from "@app/components/assistant/conversation/ActionValidationProvider";
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
import { useAgentMessageStream } from "@app/hooks/useAgentMessageStream";
import { isImageProgressOutput } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { RETRY_BLOCKED_ACTIONS_STARTED_EVENT } from "@app/lib/assistant/state/messageReducer";
import { useConversationMessage } from "@app/lib/swr/conversations";
import type {
  LightAgentMessageType,
  UserType,
  WorkspaceType,
} from "@app/types";
import { isString } from "@app/types";
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

  const [isRetryHandlerProcessing, setIsRetryHandlerProcessing] =
    React.useState<boolean>(false);

  const [activeReferences, setActiveReferences] = React.useState<
    { index: number; document: MarkdownCitation }[]
  >([]);
  const [isCopied, copy] = useCopyToClipboard();

  const isGlobalAgent = Object.values(GLOBAL_AGENTS_SID).includes(
    message.configuration.sId as GLOBAL_AGENTS_SID
  );

  const { showValidationDialog, enqueueValidation } =
    useActionValidationContext();

  const { mutateMessage } = useConversationMessage({
    conversationId,
    workspaceId: owner.sId,
    messageId: message.sId,
    options: { disabled: true },
  });

  const { messageStreamState, dispatch, shouldStream } = useAgentMessageStream({
    message,
    conversationId,
    owner,
    mutateMessage,
    onEventCallback: useCallback(
      (eventStr: string) => {
        const eventPayload = JSON.parse(eventStr);
        const eventType = eventPayload.data.type;

        if (eventType === "tool_approve_execution") {
          showValidationDialog();
          enqueueValidation({
            message,
            validationRequest: {
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
      [showValidationDialog, enqueueValidation, message]
    ),
    streamId: `message-${message.sId}`,
  });

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
              void retryHandler({
                conversationId,
                messageId: agentMessageToRender.sId,
              });
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
      const { error } = agentMessage;
      if (
        error &&
        error.code === "mcp_server_personal_authentication_required" &&
        isString(error.metadata?.mcp_server_id) &&
        error.metadata?.mcp_server_id.length > 0 &&
        isOAuthProvider(error.metadata?.provider) &&
        isValidScope(error.metadata?.scope)
      ) {
        return (
          <MCPServerPersonalAuthenticationRequired
            owner={owner}
            mcpServerId={error.metadata.mcp_server_id}
            provider={error.metadata.provider}
            scope={error.metadata.scope}
            retryHandler={async () => {
              // Dispatch retry event to reset failed state and re-enable streaming.
              dispatch(RETRY_BLOCKED_ACTIONS_STARTED_EVENT);
              // Retry on the event's conversationId, which may be coming from a subagent.
              // TODO(durable-agents): typeguard on a proper type here.
              if (
                error.metadata &&
                isString(error.metadata.messageId) &&
                isString(error.metadata.conversationId) &&
                error.metadata.conversationId !== conversationId
              ) {
                await retryHandler({
                  conversationId: error.metadata.conversationId,
                  messageId: error.metadata.messageId,
                  blockedOnly: true,
                });
              }
              // Retry on the main conversation.
              await retryHandler({
                conversationId,
                messageId: agentMessage.sId,
                blockedOnly: true,
              });
            }}
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
        <AgentMessageActions
          agentMessage={agentMessage}
          lastAgentStateClassification={messageStreamState.agentState}
          actionProgress={messageStreamState.actionProgress}
          owner={owner}
        />
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

  async function retryHandler({
    conversationId,
    messageId,
    blockedOnly = false,
  }: {
    conversationId: string;
    messageId: string;
    blockedOnly?: boolean;
  }) {
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
