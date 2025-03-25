/* eslint-disable @typescript-eslint/no-unused-vars */
import { usePlatform } from "@app/shared/context/PlatformContext";
import { assertNeverAndIgnore } from "@app/shared/lib/assertNeverAndIgnore";
import { retryMessage } from "@app/shared/lib/conversation";
import type { StoredUser } from "@app/shared/services/auth";
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
import { citationIconMap } from "@app/ui/components/markdown/MarkdownCitation";
import {
  MentionBlock,
  mentionDirective,
} from "@app/ui/components/markdown/MentionBlock";
import { useSubmitFunction } from "@app/ui/components/utils/useSubmitFunction";
import { useEventSource } from "@app/ui/hooks/useEventSource";
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
  WorkspaceType,
} from "@dust-tt/client";
import {
  assertNever,
  getProviderFromRetrievedDocument,
  getTitleFromRetrievedDocument,
  isRetrievalActionType,
  isWebsearchActionType,
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
  ClipboardIcon,
  ContentMessage,
  ConversationMessage,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  EyeIcon,
  Markdown,
  Page,
  Popover,
  useSendNotification,
} from "@dust-tt/sparkle";
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

function cleanUpCitations(message: string): string {
  const regex = / ?:cite\[[a-zA-Z0-9, ]+\]/g;
  return message.replace(regex, "");
}

export const FeedbackSelectorPopoverContent = ({
  owner,
  agentMessageToRender,
}: {
  owner: WorkspaceType;
  agentMessageToRender: AgentMessagePublicType;
}) => {
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

export function makeDocumentCitation(
  document: RetrievalDocumentPublicType
): MarkdownCitation {
  const IconComponent =
    citationIconMap[getProviderFromRetrievedDocument(document)];
  return {
    href: document.sourceUrl ?? undefined,
    title: getTitleFromRetrievedDocument(document),
    icon: <IconComponent />,
  };
}

export function makeWebsearchResultsCitation(
  result: WebsearchResultPublicType
): MarkdownCitation {
  return {
    description: result.snippet,
    href: result.link,
    title: result.title,
    icon: <DocumentTextIcon />,
  };
}

interface AgentMessageProps {
  conversationId: string;
  isLastMessage: boolean;
  message: AgentMessagePublicType;
  messageFeedback: FeedbackSelectorProps;
  owner: LightWorkspaceType;
  user: StoredUser;
}

export type AgentStateClassification = "thinking" | "acting" | "done";

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

  const isGlobalAgent = message.configuration.id === -1;

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
        setLastAgentStateClassification("thinking");
        break;
      case "browse_params":
      case "conversation_include_file_params":
      case "dust_app_run_block":
      case "dust_app_run_params":
      case "process_params":
      case "reasoning_started":
      case "reasoning_thinking":
      case "reasoning_tokens":
      case "retrieval_params":
      case "search_labels_params":
      case "tables_query_model_output":
      case "tables_query_output":
      case "tables_query_started":
      case "websearch_params":
      case "tool_params":
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
            // Log message and do nothing. Don't crash if a new token classification is not handled here.
            assertNeverAndIgnore(event);
            break;
        }
        setLastAgentStateClassification("thinking");
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
    () => (
      <FeedbackSelectorPopoverContent
        owner={owner}
        agentMessageToRender={agentMessageToRender}
      />
    ),
    [owner, agentMessageToRender]
  );

  const buttons =
    message.status === "failed"
      ? []
      : [
          <Button
            key="copy-msg-button"
            tooltip="Copy to clipboard"
            variant="ghost"
            size="xs"
            onClick={() => {
              void navigator.clipboard.writeText(
                cleanUpCitations(agentMessageToRender.content || "")
              );
            }}
            icon={ClipboardIcon}
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
          <div className="flex flex-row items-center gap-2">
            <div className="text-base font-semibold">
              {/* TODO(Ext) Any CTA here ? */}@{agentConfiguration.name}
            </div>
          </div>
        );
      }}
      type="agent"
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
        <div className="flex flex-col gap-2">
          <AgentMessageActions
            agentMessage={agentMessage}
            lastAgentStateClassification={lastAgentStateClassification}
            owner={owner}
          />

          {agentMessage.chainOfThought?.length ? (
            <ContentMessage title="Agent thoughts" variant="slate">
              {agentMessage.chainOfThought}
            </ContentMessage>
          ) : null}
        </div>
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
