import {
  ArrowPathIcon,
  Button,
  Chip,
  Citation,
  CitationIcons,
  CitationIndex,
  CitationTitle,
  ClipboardCheckIcon,
  ClipboardIcon,
  ContentMessage,
  ConversationMessage,
  DocumentIcon,
  InteractiveImageGrid,
  Markdown,
  Separator,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { marked } from "marked";
import React from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

import {
  getDocumentIcon,
  makeDocumentCitation,
} from "@app/components/actions/retrieval/utils";
import { makeWebsearchResultsCitation } from "@app/components/actions/websearch/utils";
import { AgentMessageActions } from "@app/components/assistant/conversation/actions/AgentMessageActions";
import { ActionValidationContext } from "@app/components/assistant/conversation/ActionValidationProvider";
import { AssistantHandle } from "@app/components/assistant/conversation/AssistantHandle";
import { ErrorMessage } from "@app/components/assistant/conversation/ErrorMessage";
import type { FeedbackSelectorProps } from "@app/components/assistant/conversation/FeedbackSelector";
import { FeedbackSelector } from "@app/components/assistant/conversation/FeedbackSelector";
import { FeedbackSelectorPopoverContent } from "@app/components/assistant/conversation/FeedbackSelectorPopoverContent";
import { GenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import { LabsSalesforceAuthenticationError } from "@app/components/assistant/conversation/LabsSalesforceErrorHandler";
import {
  CitationsContext,
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import type { MarkdownCitation } from "@app/components/markdown/MarkdownCitation";
import {
  MentionBlock,
  mentionDirective,
} from "@app/components/markdown/MentionBlock";
import {
  getVisualizationPlugin,
  sanitizeVisualizationContent,
  visualizationDirective,
} from "@app/components/markdown/VisualizationBlock";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useEventSource } from "@app/hooks/useEventSource";
import {
  isImageProgressOutput,
  isSearchResultResourceType,
  isWebsearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { RetrievalActionType } from "@app/lib/actions/retrieval";
import {
  isMCPActionType,
  isRetrievalActionType,
  isWebsearchActionType,
} from "@app/lib/actions/types/guards";
import type { WebsearchActionType } from "@app/lib/actions/websearch";
import type {
  AgentMessageStateEvent,
  MessageTemporaryState,
} from "@app/lib/assistant/state/messageReducer";
import { messageReducer } from "@app/lib/assistant/state/messageReducer";
import type { AgentMessageType, UserType, WorkspaceType } from "@app/types";
import {
  assertNever,
  GLOBAL_AGENTS_SID,
  isSupportedImageContentType,
  removeNulls,
} from "@app/types";

function cleanUpCitations(message: string): string {
  const regex = / ?:cite\[[a-zA-Z0-9, ]+\]/g;
  return message.replace(regex, "");
}

interface AgentMessageProps {
  conversationId: string;
  isLastMessage: boolean;
  message: AgentMessageType;
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

  const initialMessageStreamState = React.useMemo<MessageTemporaryState>(
    () => ({
      message,
      agentState: message.status === "created" ? "thinking" : "done",
      isRetrying: false,
      lastUpdated: new Date(),
      actionProgress: new Map(),
    }),
    [message]
  );

  const [messageStreamState, dispatch] = React.useReducer(
    messageReducer,
    initialMessageStreamState
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

  const [references, setReferences] = React.useState<{
    [key: string]: MarkdownCitation;
  }>({});

  const [activeReferences, setActiveReferences] = React.useState<
    { index: number; document: MarkdownCitation }[]
  >([]);
  const [isCopied, copy] = useCopyToClipboard();

  const isGlobalAgent = Object.values(GLOBAL_AGENTS_SID).includes(
    message.configuration.sId as GLOBAL_AGENTS_SID
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
      }
      const url = esURL + "?lastEventId=" + lastEventId;

      return url;
    },
    [conversationId, message.sId, owner.sId]
  );

  const { showValidationDialog } = React.useContext(ActionValidationContext);

  const onEventCallback = React.useCallback(
    (eventStr: string) => {
      const eventPayload: {
        eventId: string;
        data: AgentMessageStateEvent;
      } = JSON.parse(eventStr);

      // Handle validation dialog separately.
      if (eventPayload.data.type === "tool_approve_execution") {
        showValidationDialog({
          workspaceId: owner.sId,
          messageId: message.sId,
          conversationId: conversationId,
          action: eventPayload.data.action,
          inputs: eventPayload.data.inputs,
          stake: eventPayload.data.stake,
          metadata: eventPayload.data.metadata,
        });

        return;
      }

      dispatch(eventPayload.data);
    },
    [showValidationDialog, owner.sId, message.sId, conversationId]
  );

  useEventSource(
    buildEventSourceURL,
    onEventCallback,
    `message-${message.sId}`,
    { isReadyToConsumeStream: shouldStream }
  );

  const agentMessageToRender = ((): AgentMessageType => {
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

  const PopoverContent = React.useCallback(
    () => (
      <FeedbackSelectorPopoverContent
        owner={owner}
        agentMessageToRender={agentMessageToRender}
      />
    ),
    [owner, agentMessageToRender]
  );

  const buttons =
    message.status === "failed" || messageStreamState.agentState === "thinking"
      ? []
      : [
          <Button
            key="copy-msg-button"
            tooltip={isCopied ? "Copied!" : "Copy to clipboard"}
            variant="outline"
            size="xs"
            onClick={async () => {
              const markdownText = cleanUpCitations(
                agentMessageToRender.content || ""
              );
              // Convert markdown to HTML
              const htmlContent = await marked(markdownText);

              await copy(
                new ClipboardItem({
                  "text/plain": new Blob([markdownText], {
                    type: "text/plain",
                  }),
                  "text/html": new Blob([htmlContent], { type: "text/html" }),
                })
              );
            }}
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

  React.useEffect(() => {
    // Retrieval actions.
    const retrievalActionsWithDocs = agentMessageToRender.actions
      .filter((a) => isRetrievalActionType(a) && a.documents)
      .sort((a, b) => a.id - b.id) as RetrievalActionType[];
    const allDocs = removeNulls(
      retrievalActionsWithDocs.map((a) => a.documents).flat()
    );
    const allDocsReferences = allDocs.reduce<{
      [key: string]: MarkdownCitation;
    }>((acc, d) => {
      acc[d.reference] = makeDocumentCitation(d, isDark);
      return acc;
    }, {});

    // Websearch actions.
    const websearchActionsWithResults = agentMessageToRender.actions
      .filter((a) => isWebsearchActionType(a) && a.output?.results?.length)
      .sort((a, b) => a.id - b.id) as WebsearchActionType[];
    const allWebResults = removeNulls(
      websearchActionsWithResults.map((a) => a.output?.results).flat()
    );
    const allWebReferences = allWebResults.reduce<{
      [key: string]: MarkdownCitation;
    }>((acc, l) => {
      acc[l.reference] = makeWebsearchResultsCitation(l);
      return acc;
    }, {});

    // MCP actions with search results.
    const searchResultsWithDocs = removeNulls(
      agentMessageToRender.actions
        .filter(isMCPActionType)
        .flatMap((action) =>
          action.output
            ?.filter(isSearchResultResourceType)
            .map((o) => o.resource)
        )
    );
    const allMCPSearchResultsReferences = searchResultsWithDocs.reduce<{
      [key: string]: MarkdownCitation;
    }>((acc, d) => {
      acc[d.ref] = {
        href: d.uri,
        title: d.text,
        icon: getDocumentIcon(d.source.provider),
      };
      return acc;
    }, {});

    const websearchResultsWithDocs = removeNulls(
      agentMessageToRender.actions
        .filter(isMCPActionType)
        .flatMap((action) =>
          action.output?.filter(isWebsearchResultResourceType)
        )
    );

    const allMCPWebsearchResultsReferences = websearchResultsWithDocs.reduce<{
      [key: string]: MarkdownCitation;
    }>((acc, d) => {
      acc[d.resource.reference] = {
        href: d.resource.uri,
        title: d.resource.title,
        icon: <DocumentIcon />,
      };
      return acc;
    }, {});

    // Merge all references.
    setReferences({
      ...allDocsReferences,
      ...allWebReferences,
      ...allMCPSearchResultsReferences,
      ...allMCPWebsearchResultsReferences,
    });
  }, [
    agentMessageToRender.actions,
    agentMessageToRender.status,
    agentMessageToRender.sId,
    isDark,
  ]);
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
      mention: MentionBlock,
    }),
    [owner, conversationId, message.sId, agentConfiguration.sId]
  );

  const additionalMarkdownPlugins: PluggableList = React.useMemo(
    () => [mentionDirective, getCiteDirective(), visualizationDirective],
    []
  );

  const citations = React.useMemo(
    () => getCitations({ activeReferences }),
    [activeReferences]
  );

  const canMention = agentConfiguration.canRead;

  return (
    <ConversationMessage
      pictureUrl={agentConfiguration.pictureUrl}
      name={agentConfiguration.name}
      buttons={buttons}
      avatarBusy={agentMessageToRender.status === "created"}
      renderName={() => (
        <AssistantHandle
          assistant={agentConfiguration}
          canMention={canMention}
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
    agentMessage: AgentMessageType;
    references: { [key: string]: MarkdownCitation };
    streaming: boolean;
    lastTokenClassification: null | "tokens" | "chain_of_thought";
  }) {
    if (agentMessage.status === "failed") {
      if (agentMessage.error?.code == "require_salesforce_authentication") {
        return (
          <LabsSalesforceAuthenticationError
            owner={owner}
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
    const completedImages = messageStreamState.message.actions.flatMap(
      (action) =>
        action.generatedFiles.filter((file) =>
          isSupportedImageContentType(file.contentType)
        )
    );

    const generatedFiles = agentMessage.actions.flatMap((action) =>
      action.generatedFiles.filter(
        (file) => !isSupportedImageContentType(file.contentType)
      )
    );

    return (
      <div className="flex flex-col gap-y-4">
        <div className="flex flex-col gap-2">
          <AgentMessageActions
            agentMessage={agentMessage}
            lastAgentStateClassification={messageStreamState.agentState}
            owner={owner}
          />

          {agentMessage.chainOfThought?.length ? (
            <ContentMessage title="Agent thoughts" variant="primary">
              <Markdown
                content={agentMessage.chainOfThought}
                isStreaming={false}
                forcedTextSize="text-sm"
                textColor="text-muted-foreground"
                isLastMessage={false}
              />
            </ContentMessage>
          ) : null}
        </div>
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
                  title: file.title,
                  icon: <DocumentIcon />,
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

  async function retryHandler(agentMessage: AgentMessageType) {
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
      <Citation key={index} href={document.href} tooltip={document.title}>
        <CitationIcons>
          {index !== -1 && <CitationIndex>{index}</CitationIndex>}
          {document.icon}
        </CitationIcons>
        <CitationTitle>{document.title}</CitationTitle>
      </Citation>
    );
  });
}
