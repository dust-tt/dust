/* eslint-disable @typescript-eslint/no-unused-vars */
import type {
  AgentActionPublicType,
  AgentActionSpecificEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentMessagePublicType,
  AgentMessageSuccessEvent,
  GenerationTokensEvent,
  LightWorkspaceType,
  RetrievalActionPublicType,
  RetrievalDocumentPublicType,
  WebsearchActionPublicType,
  WebsearchResultPublicType,
} from "@dust-tt/client";
import {
  assertNever,
  getProviderFromRetrievedDocument,
  getTitleFromRetrievedDocument,
  isRetrievalActionType,
  isWebsearchActionType,
  removeNulls,
} from "@dust-tt/client";
import type { ConversationMessageSizeType } from "@dust-tt/sparkle";
import {
  ConfluenceLogo,
  DocumentTextIcon,
  DriveLogo,
  GithubLogo,
  ImageIcon,
  IntercomLogo,
  MicrosoftLogo,
  NotionLogo,
  SlackLogo,
  SnowflakeLogo,
  ZendeskLogo,
} from "@dust-tt/sparkle";
import {
  Citation,
  CitationIcons,
  CitationIndex,
  CitationTitle,
  Icon,
} from "@dust-tt/sparkle";
import {
  ArrowPathIcon,
  Button,
  ChatBubbleThoughtIcon,
  Chip,
  ClipboardIcon,
  ContentMessage,
  ConversationMessage,
  DocumentDuplicateIcon,
  EyeIcon,
  Markdown,
  Popover,
  useSendNotification,
} from "@dust-tt/sparkle";
import { AgentMessageActions } from "@extension/components/conversation/AgentMessageActions";
import { GenerationContext } from "@extension/components/conversation/GenerationContextProvider";
import type { MarkdownCitation } from "@extension/components/conversation/MarkdownCitation";
import {
  CitationsContext,
  CiteBlock,
  getCiteDirective,
} from "@extension/components/markdown/CiteBlock";
import {
  MentionBlock,
  mentionDirective,
} from "@extension/components/markdown/MentionBlock";
import { useSubmitFunction } from "@extension/components/utils/useSubmitFunction";
import { useEventSource } from "@extension/hooks/useEventSource";
import { assertNeverAndIgnore } from "@extension/lib/assertNeverAndIgnore";
import { retryMessage } from "@extension/lib/conversation";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Components } from "react-markdown";
import type { ReactMarkdownProps } from "react-markdown/lib/complex-types";
import type { PluggableList } from "react-markdown/lib/react-markdown";
import { visit } from "unist-util-visit";

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

export function makeDocumentCitation(
  document: RetrievalDocumentPublicType
): MarkdownCitation {
  return {
    href: document.sourceUrl ?? undefined,
    title: getTitleFromRetrievedDocument(document),
    type: getProviderFromRetrievedDocument(document),
  };
}

export function makeWebsearchResultsCitation(
  result: WebsearchResultPublicType
): MarkdownCitation {
  return {
    description: result.snippet,
    href: result.link,
    title: result.title,
    type: "document" as const,
  };
}

interface AgentMessageProps {
  conversationId: string;
  isLastMessage: boolean;
  message: AgentMessagePublicType;
  owner: LightWorkspaceType;
  size: ConversationMessageSizeType;
}

/**
 *
 * @param isInModal is the conversation happening in a side modal, i.e. when
 * testing an assistant? see conversation/Conversation.tsx
 * @returns
 */
export function AgentMessage({
  conversationId,
  isLastMessage,
  message,
  owner,
  size,
}: AgentMessageProps) {
  const sendNotification = useSendNotification();

  const [streamedAgentMessage, setStreamedAgentMessage] =
    useState<AgentMessagePublicType>(message);

  const [isRetryHandlerProcessing, setIsRetryHandlerProcessing] =
    useState<boolean>(false);

  const [references, setReferences] = useState<{
    [key: string]: MarkdownCitation;
  }>({});

  const [activeReferences, setActiveReferences] = useState<
    { index: number; document: MarkdownCitation }[]
  >([]);

  const shouldStream = (() => {
    if (message.status !== "created") {
      return false;
    }

    switch (streamedAgentMessage.status) {
      case "succeeded":
      case "failed":
      case "cancelled":
        return false;
      case "created":
        return true;
      default:
        assertNever(streamedAgentMessage.status);
    }
  })();

  const [lastTokenClassification, setLastTokenClassification] = useState<
    null | "tokens" | "chain_of_thought"
  >(null);

  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
      const esURL = `${process.env.DUST_DOMAIN}/api/v1/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${message.sId}/events`;
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

  const onEventCallback = useCallback((eventStr: string) => {
    const eventPayload: {
      eventId: string;
      data:
        | AgentErrorEvent
        | AgentActionSpecificEvent
        | AgentActionSuccessEvent
        | GenerationTokensEvent
        | AgentGenerationCancelledEvent
        | AgentMessageSuccessEvent;
    } = JSON.parse(eventStr);

    const updateMessageWithAction = (
      m: AgentMessagePublicType,
      action: AgentActionPublicType
    ): AgentMessagePublicType => {
      return {
        ...m,
        actions: m.actions
          ? [...m.actions.filter((a) => a.id !== action.id), action]
          : [action],
      };
    };

    const event = eventPayload.data;
    switch (event.type) {
      case "agent_action_success":
        setStreamedAgentMessage((m) => {
          return { ...updateMessageWithAction(m, event.action) };
        });
        break;
      case "retrieval_params":
      case "dust_app_run_params":
      case "dust_app_run_block":
      case "tables_query_started":
      case "tables_query_model_output":
      case "tables_query_output":
      case "process_params":
      case "websearch_params":
      case "browse_params":
      case "conversation_include_file_params":
        setStreamedAgentMessage((m) => {
          return updateMessageWithAction(m, event.action);
        });
        break;
      case "agent_error":
        setStreamedAgentMessage((m) => {
          return { ...m, status: "failed", error: event.error };
        });
        break;

      case "agent_generation_cancelled":
        setStreamedAgentMessage((m) => {
          return { ...m, status: "cancelled" };
        });
        break;
      case "agent_message_success": {
        setStreamedAgentMessage((m) => {
          return {
            ...m,
            ...event.message,
          };
        });
        break;
      }

      case "generation_tokens": {
        switch (event.classification) {
          case "closing_delimiter":
            break;
          case "opening_delimiter":
            break;
          case "tokens":
            setLastTokenClassification("tokens");
            setStreamedAgentMessage((m) => {
              const previousContent = m.content || "";
              return { ...m, content: previousContent + event.text };
            });
            break;
          case "chain_of_thought":
            setLastTokenClassification("chain_of_thought");
            setStreamedAgentMessage((m) => {
              const currentChainOfThought = m.chainOfThought ?? "";
              return {
                ...m,
                chainOfThought: currentChainOfThought + event.text,
              };
            });
            break;
          default:
            // Log message and do nothing. Don't crash if a new token classification is not handled here.
            assertNeverAndIgnore(event.classification);
            break;
        }
        break;
      }

      default:
        // Log message and do nothing. Don't crash if a new event type is not handled here.
        assertNeverAndIgnore(event);
        break;
    }
  }, []);

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
        if (streamedAgentMessage.status === "created") {
          return { ...streamedAgentMessage, status: "cancelled" };
        }
        return message;
      case "created":
        return streamedAgentMessage;
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
    // Retrieval actions
    const retrievalActionsWithDocs = agentMessageToRender.actions
      .filter((a) => isRetrievalActionType(a) && a.documents)
      .sort((a, b) => a.id - b.id) as RetrievalActionPublicType[];
    const allDocs = removeNulls(
      retrievalActionsWithDocs.map((a) => a.documents).flat()
    );
    const allDocsReferences = allDocs.reduce<{
      [key: string]: MarkdownCitation;
    }>((acc, d) => {
      acc[d.reference] = makeDocumentCitation(d);
      return acc;
    }, {});

    // Websearch actions
    const websearchActionsWithResults = agentMessageToRender.actions
      .filter((a) => isWebsearchActionType(a) && a.output?.results?.length)
      .sort((a, b) => a.id - b.id) as WebsearchActionPublicType[];
    const allWebResults = removeNulls(
      websearchActionsWithResults.map((a) => a.output?.results).flat()
    );
    const allWebReferences = allWebResults.reduce<{
      [key: string]: MarkdownCitation;
    }>((acc, l) => {
      acc[l.reference] = makeWebsearchResultsCitation(l);
      return acc;
    }, {});

    // Merge all references
    setReferences({ ...allDocsReferences, ...allWebReferences });
  }, [
    agentMessageToRender.actions,
    agentMessageToRender.status,
    agentMessageToRender.sId,
  ]);
  const { configuration: agentConfiguration } = agentMessageToRender;

  const additionalMarkdownComponents: Components = useMemo(
    () => ({
      visualization: (props: ReactMarkdownProps) => (
        <div className="w-full flex justify-center">
          <Button
            label="See visualization on Dust website"
            onClick={() => {
              window.open(
                `${process.env.DUST_DOMAIN}/w/${owner.sId}/assistant/${conversationId}`
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

  function cleanUpCitations(message: string): string {
    const regex = / ?:cite\[[a-zA-Z0-9, ]+\]/g;
    return message.replace(regex, "");
  }

  const buttons =
    message.status === "failed"
      ? []
      : [
          <Button
            key="copy-msg-button"
            tooltip="Copy to clipboard"
            variant="outline"
            size="xs"
            onClick={() => {
              void navigator.clipboard.writeText(
                cleanUpCitations(agentMessageToRender.content || "")
              );
            }}
            icon={ClipboardIcon}
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
            disabled={isRetryHandlerProcessing || shouldStream}
          />,
        ];

  return (
    <ConversationMessage
      pictureUrl={agentConfiguration.pictureUrl}
      name={`@${agentConfiguration.name}`}
      buttons={buttons}
      avatarBusy={agentMessageToRender.status === "created"}
      renderName={() => {
        return (
          <div className="flex flex-row items-center gap-2">
            <div className="text-base font-medium">
              {/* TODO(Ext) Any CTA here ? */}@{agentConfiguration.name}
            </div>
          </div>
        );
      }}
      type="agent"
      size={size}
      citations={citations}
    >
      <div>
        {renderAgentMessage({
          agentMessage: agentMessageToRender,
          references: references,
          streaming: shouldStream,
          lastTokenClassification: lastTokenClassification,
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
          size={size}
          owner={owner}
        />

        {agentMessage.chainOfThought?.length ? (
          <ContentMessage
            title="Assistant thoughts"
            variant="slate"
            icon={ChatBubbleThoughtIcon}
          >
            {agentMessage.chainOfThought}
          </ContentMessage>
        ) : null}

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
    const res = await retryMessage({
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
  error: { code: string; message: string };
  retryHandler: () => void;
}) {
  const fullMessage =
    "ERROR: " + error.message + (error.code ? ` (code: ${error.code})` : "");

  const { submit: retry, isSubmitting: isRetrying } = useSubmitFunction(
    async () => retryHandler()
  );

  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-1 sm:flex-row">
        <Chip
          color="warning"
          label={"ERROR: " + shortText(error.message)}
          size="xs"
        />
        <Popover
          trigger={
            <Button
              variant="ghost"
              size="xs"
              icon={EyeIcon}
              label="See the error"
            />
          }
          content={
            <div className="flex flex-col gap-3">
              <div className="text-sm font-normal text-warning-800">
                {fullMessage}
              </div>
              <div className="self-end">
                <Button
                  variant="ghost"
                  size="xs"
                  icon={DocumentDuplicateIcon}
                  label={"Copy"}
                  onClick={() =>
                    void navigator.clipboard.writeText(fullMessage)
                  }
                />
              </div>
            </div>
          }
        />
      </div>
      <div>
        <Button
          variant="ghost"
          size="sm"
          icon={ArrowPathIcon}
          label="Retry"
          onClick={retry}
          disabled={isRetrying}
        />
      </div>
    </div>
  );
}

function shortText(text: string, maxLength = 30) {
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
}
