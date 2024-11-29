import type {
  ConversationMessageFeedbackSelectorProps,
  ConversationMessageSizeType,
} from "@dust-tt/sparkle";
import {
  ArrowPathIcon,
  Button,
  ChatBubbleThoughtIcon,
  Chip,
  Citation,
  ClipboardIcon,
  ContentMessage,
  ConversationMessage,
  DocumentDuplicateIcon,
  EyeIcon,
  FeedbackSelector,
  Markdown,
  Popover,
} from "@dust-tt/sparkle";
import type {
  AgentActionSpecificEvent,
  AgentActionSuccessEvent,
  AgentActionType,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentMessageSuccessEvent,
  AgentMessageType,
  GenerationTokensEvent,
  LightAgentConfigurationType,
  RetrievalActionType,
  UserType,
  WebsearchActionType,
  WithRank,
  WorkspaceType,
} from "@dust-tt/types";
import {
  assertNever,
  isRetrievalActionType,
  isWebsearchActionType,
  removeNulls,
} from "@dust-tt/types";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

import { makeDocumentCitation } from "@app/components/actions/retrieval/utils";
import { makeWebsearchResultsCitation } from "@app/components/actions/websearch/utils";
import { AssistantDropdownMenu } from "@app/components/assistant/AssistantDropdownMenu";
import { AgentMessageActions } from "@app/components/assistant/conversation/actions/AgentMessageActions";
import { GenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
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
  getInteractiveDocumentPlugin,
  getVisualizationPlugin,
  interactiveDocumentDirective,
  sanitizeContent,
  visualizationDirective,
} from "@app/components/markdown/VisualizationBlock";
import { useEventSource } from "@app/hooks/useEventSource";
import { useSubmitFunction } from "@app/lib/client/utils";

function cleanUpCitations(message: string): string {
  const regex = / ?:cite\[[a-zA-Z0-9, ]+\]/g;
  return message.replace(regex, "");
}

interface AgentMessageProps {
  conversationId: string;
  isInModal: boolean;
  isLastMessage: boolean;
  message: WithRank<AgentMessageType>;
  messageFeedback: ConversationMessageFeedbackSelectorProps;
  owner: WorkspaceType;
  user: UserType;
  size: ConversationMessageSizeType;
}

export type AgentStateClassification = "thinking" | "acting" | "done";

/**
 *
 * @param isInModal is the conversation happening in a side modal, i.e. when
 * testing an assistant? see conversation/Conversation.tsx
 * @returns
 */
export function AgentMessage({
  conversationId,
  isInModal,
  isLastMessage,
  message,
  messageFeedback,
  owner,
  user,
  size,
}: AgentMessageProps) {
  const [streamedAgentMessage, setStreamedAgentMessage] =
    useState<AgentMessageType>(message);

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

  const [lastAgentStateClassification, setLastAgentStateClassification] =
    useState<AgentStateClassification>(shouldStream ? "thinking" : "done");
  const [lastTokenClassification, setLastTokenClassification] = useState<
    null | "tokens" | "chain_of_thought"
  >(null);

  useEffect(() => {
    if (message.status !== "created") {
      setLastAgentStateClassification("done");
    }
  }, [message.status]);

  const buildEventSourceURL = useCallback(
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
      m: AgentMessageType,
      action: AgentActionType
    ): AgentMessageType => {
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
        setLastAgentStateClassification("thinking");
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
        setLastAgentStateClassification("acting");
        break;
      case "agent_error":
        setStreamedAgentMessage((m) => {
          return { ...m, status: "failed", error: event.error };
        });
        setLastAgentStateClassification("done");
        break;

      case "agent_generation_cancelled":
        setStreamedAgentMessage((m) => {
          return { ...m, status: "cancelled" };
        });
        setLastAgentStateClassification("done");
        break;
      case "agent_message_success": {
        setStreamedAgentMessage((m) => {
          return {
            ...m,
            ...event.message,
          };
        });
        setLastAgentStateClassification("done");
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
            assertNever(event);
        }
        setLastAgentStateClassification("thinking");
        break;
      }

      default:
        assertNever(event);
    }
  }, []);

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

  // GenerationContext: to know if we are generating or not
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
          <FeedbackSelector key="feedback-selector" {...messageFeedback} />,
        ];

  // References logic.
  function updateActiveReferences(document: MarkdownCitation, index: number) {
    const existingIndex = activeReferences.find((r) => r.index === index);
    if (!existingIndex) {
      setActiveReferences([...activeReferences, { index, document }]);
    }
  }

  const [lastHoveredReference, setLastHoveredReference] = useState<
    number | null
  >(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (lastHoveredReference !== null) {
      timer = setTimeout(() => {
        setLastHoveredReference(null);
      }, 1000); // Reset after 1 second.
    }
    return () => clearTimeout(timer);
  }, [lastHoveredReference]);

  useEffect(() => {
    // Retrieval actions
    const retrievalActionsWithDocs = agentMessageToRender.actions
      .filter((a) => isRetrievalActionType(a) && a.documents)
      .sort((a, b) => a.id - b.id) as RetrievalActionType[];
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

    // Merge all references
    setReferences({ ...allDocsReferences, ...allWebReferences });
  }, [
    agentMessageToRender.actions,
    agentMessageToRender.status,
    agentMessageToRender.sId,
  ]);
  const { configuration: agentConfiguration } = agentMessageToRender;

  const messageVersion = message.rank * 1000 + message.version;

  const additionalMarkdownComponents: Components = useMemo(
    () => ({
      visualization: getVisualizationPlugin(
        owner,
        agentConfiguration.sId,
        conversationId,
        message.sId
      ),
      doc: getInteractiveDocumentPlugin(
        agentConfiguration.sId,
        messageVersion
      ),
      sup: CiteBlock,
      mention: MentionBlock,
    }),
    [owner, conversationId, message.sId, agentConfiguration.sId, messageVersion]
  );

  const additionalMarkdownPlugins: PluggableList = useMemo(
    () => [
      mentionDirective,
      getCiteDirective(),
      visualizationDirective,
      interactiveDocumentDirective,
    ],
    []
  );

  const citations = useMemo(
    () => getCitations({ activeReferences, lastHoveredReference }),
    [activeReferences, lastHoveredReference]
  );

  const canMention =
    agentConfiguration.scope !== "private" ||
    agentConfiguration.versionAuthorId === user.id;

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
              {AssitantName(agentConfiguration, canMention)}
            </div>
            {!isInModal && (
              <AssistantDropdownMenu
                agentConfiguration={agentConfiguration}
                owner={owner}
                user={user}
                showAddRemoveToFavorite
              />
            )}
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
    agentMessage: AgentMessageType;
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
          lastAgentStateClassification={lastAgentStateClassification}
          size={size}
          owner={owner}
        />

        {agentMessage.chainOfThought?.length ? (
          <ContentMessage
            title="Assistant thoughts"
            variant="slate"
            icon={ChatBubbleThoughtIcon}
          >
            <Markdown
              content={agentMessage.chainOfThought}
              isStreaming={false}
              textSize="sm"
              textColor="slate-700"
              isLastMessage={isLastMessage}
            />
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
                  setHoveredReference: setLastHoveredReference,
                }}
              >
                <Markdown
                  content={sanitizeContent(agentMessage.content)}
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

function AssitantName(
  assistant: LightAgentConfigurationType,
  canMention: boolean = true
) {
  const router = useRouter();
  const href = {
    pathname: router.pathname,
    query: { ...router.query, assistantDetails: assistant.sId },
  };

  if (!canMention) {
    return <span>@{assistant.name}</span>;
  }

  return (
    <Link
      href={href}
      shallow
      className="cursor-pointer duration-300 hover:text-action-500 active:text-action-600"
    >
      @{assistant.name}
    </Link>
  );
}

function getCitations({
  activeReferences,
  lastHoveredReference,
}: {
  activeReferences: {
    index: number;
    document: MarkdownCitation;
  }[];
  lastHoveredReference: number | null;
}) {
  activeReferences.sort((a, b) => a.index - b.index);
  return activeReferences.map(({ document, index }) => {
    return (
      <Citation
        key={index}
        size="xs"
        sizing="fluid"
        isBlinking={lastHoveredReference === index}
        type={document.type}
        title={document.title}
        href={document.href}
        index={index}
      />
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
