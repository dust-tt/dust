import { usePlatform } from "@app/shared/context/PlatformContext";
import { retryMessage } from "@app/shared/lib/conversation";
import { formatMessageTime } from "@app/shared/lib/utils";
import type { StoredUser } from "@app/shared/services/auth";
import type {
  AgentMessageStateEvent,
  MessageTemporaryState,
} from "@app/ui/components/assistants/state/messageReducer";
import { messageReducer } from "@app/ui/components/assistants/state/messageReducer";
import { ActionValidationContext } from "@app/ui/components/conversation/ActionValidationProvider";
import { AgentMessageActions } from "@app/ui/components/conversation/AgentMessageActions";
import type { FeedbackSelectorProps } from "@app/ui/components/conversation/FeedbackSelector";
import { FeedbackSelector } from "@app/ui/components/conversation/FeedbackSelector";
import { GenerationContext } from "@app/ui/components/conversation/GenerationContextProvider";
import {
  CitationsContext,
  CiteBlock,
  getCiteDirective,
} from "@app/ui/components/markdown/CiteBlock";
import type { MarkdownCitation } from "@app/ui/components/markdown/MarkdownCitation";
import {
  MentionBlock,
  mentionDirective,
} from "@app/ui/components/markdown/MentionBlock";
import { useSubmitFunction } from "@app/ui/components/utils/useSubmitFunction";
import { useEventSource } from "@app/ui/hooks/useEventSource";
import type {
  AgentMessagePublicType,
  LightWorkspaceType,
  SearchResultResourceType,
  WebsearchResultResourceType,
} from "@dust-tt/client";
import {
  assertNever,
  isRunAgentResultResourceType,
  isSearchResultResourceType,
  isWebsearchResultResourceType,
  removeNulls,
} from "@dust-tt/client";
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
  DocumentPileIcon,
  DocumentTextIcon,
  EyeIcon,
  InformationCircleIcon,
  Markdown,
  Page,
  Popover,
  useCopyToClipboard,
  useSendNotification,
} from "@dust-tt/sparkle";
import { marked } from "marked";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";
import { visit } from "unist-util-visit";

export const FeedbackSelectorPopoverContent = () => {
  return (
    <div className="mb-4 mt-2 flex flex-col gap-2">
      <Page.P variant="secondary">
        Your feedback is available to editors of the agent.
      </Page.P>
    </div>
  );
};

export function visualizationDirective() {
  return (tree: any) => {
    visit(tree, ["containerDirective"], (node) => {
      if (node.name === "visualization") {
        const data = node.data || (node.data = {});
        data.hName = "visualization";
        data.hProperties = {
          position: node.position,
        };
      }
    });
  };
}

export function makeMCPActionCitation(
  result: SearchResultResourceType | WebsearchResultResourceType
): MarkdownCitation {
  return {
    href: result.uri,
    title: result.text,
    icon: <DocumentTextIcon />,
  };
}

export const getCitationsFromActions = (
  actions: AgentMessagePublicType["actions"]
): Record<string, MarkdownCitation> => {
  const searchResultsWithDocs = removeNulls(
    actions.flatMap((action) =>
      action.output?.filter(isSearchResultResourceType).map((o) => o.resource)
    )
  );

  const searchRefs: Record<string, MarkdownCitation> = {};
  searchResultsWithDocs.forEach((d) => {
    searchRefs[d.ref] = makeMCPActionCitation(d);
  });

  const websearchResultsWithDocs = removeNulls(
    actions.flatMap((action) =>
      action.output
        ?.filter(isWebsearchResultResourceType)
        .map((o) => o.resource)
    )
  );

  const websearchRefs: Record<string, MarkdownCitation> = {};
  websearchResultsWithDocs.forEach((d) => {
    websearchRefs[d.reference] = makeMCPActionCitation(d);
  });

  const runAgentResultsWithRefs = removeNulls(
    actions.flatMap((action) =>
      action.output?.filter(isRunAgentResultResourceType).map((o) => o.resource)
    )
  );

  const runAgentRefs: Record<string, MarkdownCitation> = {};
  runAgentResultsWithRefs.forEach((result) => {
    if (result.refs) {
      Object.entries(result.refs).forEach(([ref, citation]) => {
        runAgentRefs[ref] = {
          href: citation.href ?? "",
          title: citation.title,
          icon: <DocumentTextIcon />,
        };
      });
    }
  });

  return {
    ...searchRefs,
    ...websearchRefs,
    ...runAgentRefs,
  };
};

interface AgentMessageProps {
  conversationId: string;
  isLastMessage: boolean;
  message: AgentMessagePublicType;
  messageFeedback: FeedbackSelectorProps;
  owner: LightWorkspaceType;
  user: StoredUser;
}

type AgentMessageStateWithControlEvent =
  | AgentMessageStateEvent
  | { type: "end-of-stream" };

function makeInitialMessageStreamState(
  message: AgentMessagePublicType
): MessageTemporaryState {
  return {
    actionProgress: new Map(),
    agentState: message.status === "created" ? "thinking" : "done",
    isRetrying: false,
    lastUpdated: new Date(),
    message,
  };
}

export type AgentStateClassification =
  | "thinking"
  | "acting"
  | "writing"
  | "done";

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
  user,
}: AgentMessageProps) {
  const platform = usePlatform();
  const sendNotification = useSendNotification();

  const [messageStreamState, dispatch] = useReducer(
    messageReducer,
    message,
    makeInitialMessageStreamState
  );

  const [isRetryHandlerProcessing, setIsRetryHandlerProcessing] =
    useState<boolean>(false);

  const [references, setReferences] = useState<{
    [key: string]: MarkdownCitation;
  }>({});

  const [activeReferences, setActiveReferences] = useState<
    { index: number; document: MarkdownCitation }[]
  >([]);
  const [isCopied, copy] = useCopyToClipboard();

  const isGlobalAgent = message.configuration.id === -1;

  const { showValidationDialog } = useContext(ActionValidationContext);

  const shouldStream = (() => {
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
  })();

  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
      const esURL = `${user.dustDomain}/api/v1/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${message.sId}/events`;
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

  const onEventCallback = useCallback(
    (eventStr: string) => {
      const eventPayload: {
        eventId: string;
        data: AgentMessageStateWithControlEvent;
      } = JSON.parse(eventStr);
      const eventType = eventPayload.data.type;

      // Handle validation dialog separately.
      if (eventType === "tool_approve_execution") {
        showValidationDialog({
          actionId: eventPayload.data.actionId,
          conversationId: conversationId,
          inputs: eventPayload.data.inputs,
          messageId: message.sId,
          metadata: eventPayload.data.metadata,
          stake: eventPayload.data.stake,
          workspaceId: owner.sId,
        });

        return;
      }

      // This event is emitted in front/lib/api/assistant/pubsub.ts. Its purpose is to signal the
      // end of the stream to the client. The message reducer does not, and should not, handle this
      // event, so we just return.
      if (eventType === "end-of-stream") {
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

  const agentMessageToRender = ((): AgentMessagePublicType => {
    switch (message.status) {
      case "succeeded":
      case "failed":
        return message;
      case "cancelled":
        if (messageStreamState.message.status === "created") {
          return { ...messageStreamState.message, status: "cancelled" };
        }
        return message;
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
  const isAtBottom = useRef(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
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

  // References logic.
  function updateActiveReferences(document: MarkdownCitation, index: number) {
    const existingIndex = activeReferences.find((r) => r.index === index);
    if (!existingIndex) {
      setActiveReferences([...activeReferences, { index, document }]);
    }
  }

  const generationContext = useContext(GenerationContext);
  if (!generationContext) {
    throw new Error(
      "AgentMessage must be used within a GenerationContextProvider"
    );
  }

  useEffect(() => {
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

  useEffect(() => {
    setReferences(getCitationsFromActions(agentMessageToRender.actions));
  }, [
    agentMessageToRender.actions,
    agentMessageToRender.status,
    agentMessageToRender.sId,
  ]);
  const { configuration: agentConfiguration } = agentMessageToRender;

  const additionalMarkdownComponents: Components = useMemo(
    () => ({
      visualization: () => (
        <div className="w-full flex justify-center">
          <Button
            label="See visualization on Dust website"
            onClick={() => {
              window.open(
                `${user.dustDomain}/w/${owner.sId}/assistant/${conversationId}`
              );
            }}
          />
        </div>
      ),
      sup: CiteBlock,
      mention: MentionBlock,
    }),
    [owner, conversationId, message.sId, agentConfiguration.sId]
  );

  const additionalMarkdownPlugins: PluggableList = useMemo(
    () => [mentionDirective, getCiteDirective(), visualizationDirective],
    []
  );

  const citations = useMemo(
    () => getCitations({ activeReferences }),
    [activeReferences]
  );

  const PopoverContent = useCallback(
    () => <FeedbackSelectorPopoverContent />,
    []
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
            tooltip="Copy to clipboard"
            variant="ghost"
            size="xs"
            onClick={handleCopyToClipboard}
            icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
            className="text-muted-foreground dark:text-muted-foreground-night"
          />,
          <Button
            key="retry-msg-button"
            tooltip="Retry"
            variant="ghost"
            size="xs"
            onClick={() => {
              void retryHandler(agentMessageToRender);
            }}
            icon={ArrowPathIcon}
            className="text-muted-foreground dark:text-muted-foreground-night"
            disabled={isRetryHandlerProcessing || shouldStream}
          />,
          // One cannot leave feedback on global agents.
          ...(isGlobalAgent ||
          agentMessageToRender.configuration.status === "draft"
            ? []
            : [
                <div key="separator" className="flex items-center">
                  <div className="h-5 w-px bg-border dark:bg-border-night" />
                </div>,
                <FeedbackSelector
                  key="feedback-selector"
                  {...messageFeedback}
                  getPopoverInfo={PopoverContent}
                />,
              ]),
        ];

  return (
    <ConversationMessage
      pictureUrl={agentConfiguration.pictureUrl}
      name={agentConfiguration.name}
      buttons={buttons}
      avatarBusy={agentMessageToRender.status === "created"}
      renderName={() => {
        return (
          <span>
            {/* TODO(Ext) Any CTA here ? */}
            {agentConfiguration.name}
          </span>
        );
      }}
      type="agent"
      timestamp={formatMessageTime(agentMessageToRender.created)}
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
    agentMessage: AgentMessagePublicType;
    references: { [key: string]: MarkdownCitation };
    streaming: boolean;
    lastTokenClassification: null | "tokens" | "chain_of_thought";
  }) {
    if (agentMessage.status === "failed") {
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

    return (
      <div className="flex flex-col gap-y-4">
        <AgentMessageActions
          agentMessage={agentMessage}
          lastAgentStateClassification={messageStreamState.agentState}
          owner={owner}
          actionProgress={messageStreamState.actionProgress}
        />
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
                  content={agentMessage.content}
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
        {agentMessage.status === "cancelled" && (
          <Chip
            label="Message generation was interrupted"
            size="xs"
            className="mt-4"
          />
        )}
      </div>
    );
  }

  async function retryHandler(agentMessage: AgentMessagePublicType) {
    setIsRetryHandlerProcessing(true);
    const res = await retryMessage(platform, {
      owner,
      conversationId,
      messageId: agentMessage.sId,
    });
    if (res.isErr()) {
      console.error(res.error);
      sendNotification({
        title: res.error.title,
        description: res.error.message,
        type: "error",
      });
    }
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
      <Citation key={index} href={document.href}>
        <CitationIcons>
          <CitationIndex>{index}</CitationIndex>
          {document.icon}
        </CitationIcons>
        <CitationTitle>{document.title}</CitationTitle>
      </Citation>
    );
  });
}

function ErrorMessage({
  error,
  retryHandler,
}: {
  error: NonNullable<AgentMessagePublicType["error"]>;
  retryHandler: () => void;
}) {
  const errorIsRetryable =
    error.metadata?.category === "retryable_model_error" ||
    error.metadata?.category === "stream_error";

  const debugInfo = [
    error.metadata?.category ? `category: ${error.metadata?.category}` : "",
    error.code ? `code: ${error.code}` : "",
  ]
    .filter((s) => s.length > 0)
    .join(", ");

  const { submit: retry, isSubmitting: isRetrying } = useSubmitFunction(
    async () => retryHandler()
  );

  return (
    <ContentMessage
      title={`${error.metadata?.errorTitle || "Agent error"}`}
      variant={errorIsRetryable ? "golden" : "warning"}
      className="flex flex-col gap-3"
      icon={InformationCircleIcon}
    >
      <div className="whitespace-normal break-words">{error.message}</div>
      <div className="flex flex-row gap-2 pt-3">
        <Button
          variant="outline"
          size="xs"
          icon={ArrowPathIcon}
          label="Retry"
          onClick={retry}
          disabled={isRetrying}
        />
        <Popover
          popoverTriggerAsChild
          trigger={
            <Button
              variant="outline"
              size="xs"
              icon={EyeIcon}
              label="Details"
            />
          }
          content={
            <div className="flex flex-col gap-3">
              <div className="whitespace-normal text-sm font-normal text-warning">
                {debugInfo}
              </div>
              <div className="self-end">
                <Button
                  variant="ghost"
                  size="xs"
                  icon={DocumentPileIcon}
                  label={"Copy"}
                  onClick={() =>
                    void navigator.clipboard.writeText(
                      error.message + (debugInfo ? ` (${debugInfo})` : "")
                    )
                  }
                />
              </div>
            </div>
          }
        />
      </div>
    </ContentMessage>
  );
}
