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
  DocumentDuplicateIcon,
  EyeIcon,
  Markdown,
  Page,
  Popover,
  Separator,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { marked } from "marked";
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
import { AgentMessageActions } from "@app/components/assistant/conversation/actions/AgentMessageActions";
import type { FeedbackSelectorProps } from "@app/components/assistant/conversation/FeedbackSelector";
import { FeedbackSelector } from "@app/components/assistant/conversation/FeedbackSelector";
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
  getVisualizationPlugin,
  sanitizeVisualizationContent,
  visualizationDirective,
} from "@app/components/markdown/VisualizationBlock";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useEventSource } from "@app/hooks/useEventSource";
import type { RetrievalActionType } from "@app/lib/actions/retrieval";
import type { AgentActionSpecificEvent } from "@app/lib/actions/types/agent";
import {
  isRetrievalActionType,
  isWebsearchActionType,
} from "@app/lib/actions/types/guards";
import type { WebsearchActionType } from "@app/lib/actions/websearch";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useAgentConfigurationLastAuthor } from "@app/lib/swr/assistants";
import type {
  AgentActionSuccessEvent,
  AgentActionType,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentMessageSuccessEvent,
  AgentMessageType,
  GenerationTokensEvent,
  LightAgentConfigurationType,
  UserType,
  WorkspaceType,
} from "@app/types";
import { assertNever, GLOBAL_AGENTS_SID, removeNulls } from "@app/types";

function cleanUpCitations(message: string): string {
  const regex = / ?:cite\[[a-zA-Z0-9, ]+\]/g;
  return message.replace(regex, "");
}

export const FeedbackSelectorPopoverContent = ({
  owner,
  agentMessageToRender,
}: {
  owner: WorkspaceType;
  agentMessageToRender: AgentMessageType;
}) => {
  const { agentLastAuthor } = useAgentConfigurationLastAuthor({
    workspaceId: owner.sId,
    agentConfigurationId: agentMessageToRender.configuration.sId,
  });

  return (
    agentLastAuthor && (
      <div className="mb-4 mt-2 flex flex-col gap-2">
        <Page.P variant="secondary">
          Your feedback is available to editors of the agent. The last agent
          editor is:
        </Page.P>
        <div className="flex flex-row items-center gap-2">
          {agentLastAuthor.image && (
            <img
              src={agentLastAuthor.image}
              alt={agentLastAuthor.firstName}
              className="h-8 w-8 rounded-full"
            />
          )}
          <Page.P variant="primary">
            {agentLastAuthor.firstName} {agentLastAuthor.lastName}
          </Page.P>
        </div>
      </div>
    )
  );
};

interface AgentMessageProps {
  conversationId: string;
  isLastMessage: boolean;
  message: AgentMessageType;
  messageFeedback: FeedbackSelectorProps;
  owner: WorkspaceType;
  user: UserType;
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
  const { isDark } = useTheme();
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
  const [isCopied, copy] = useCopyToClipboard();

  const isGlobalAgent = useMemo(() => {
    return Object.values(GLOBAL_AGENTS_SID).includes(
      message.configuration.sId as GLOBAL_AGENTS_SID
    );
  }, [message.configuration.sId]);

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
      acc[d.reference] = makeDocumentCitation(d, isDark);
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
    isDark,
  ]);
  const { configuration: agentConfiguration } = agentMessageToRender;

  const additionalMarkdownComponents: Components = useMemo(
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

  const additionalMarkdownPlugins: PluggableList = useMemo(
    () => [mentionDirective, getCiteDirective(), visualizationDirective],
    []
  );

  const citations = useMemo(
    () => getCitations({ activeReferences }),
    [activeReferences]
  );

  const canMention =
    agentConfiguration.scope !== "private" ||
    agentConfiguration.versionAuthorId === user.id;

  return (
    <ConversationMessage
      pictureUrl={agentConfiguration.pictureUrl}
      name={agentConfiguration.name}
      buttons={buttons}
      avatarBusy={agentMessageToRender.status === "created"}
      renderName={() => AssistantName(agentConfiguration, canMention)}
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
        <div className="flex flex-col gap-2">
          <AgentMessageActions
            agentMessage={agentMessage}
            lastAgentStateClassification={lastAgentStateClassification}
            owner={owner}
          />

          {agentMessage.chainOfThought?.length ? (
            <ContentMessage title="Agent thoughts" variant="slate">
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

function AssistantName(
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
      className="cursor-pointer transition duration-200 hover:text-highlight active:text-highlight-600"
    >
      @{assistant.name}
    </Link>
  );
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
              variant="outline"
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
          variant="outline"
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
