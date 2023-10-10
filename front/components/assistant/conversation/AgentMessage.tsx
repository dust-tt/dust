import {
  ArrowPathIcon,
  Button,
  Chip,
  ClipboardIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  DropdownMenu,
  ExternalLinkIcon,
  EyeIcon,
  IconButton,
  Spinner,
} from "@dust-tt/sparkle";
import Link from "next/link";
import { useCallback, useContext, useEffect, useRef, useState } from "react";

import { AgentAction } from "@app/components/assistant/conversation/AgentAction";
import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";
import { GenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import {
  linkFromDocument,
  PROVIDER_LOGO_PATH,
  providerFromDocument,
  titleFromDocument,
} from "@app/components/assistant/conversation/RetrievalAction";
import { RenderMessageMarkdown } from "@app/components/assistant/RenderMessageMarkdown";
import { useEventSource } from "@app/hooks/useEventSource";
import {
  AgentActionEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentGenerationSuccessEvent,
  AgentMessageSuccessEvent,
} from "@app/lib/api/assistant/agent";
import { GenerationTokensEvent } from "@app/lib/api/assistant/generation";
import { classNames } from "@app/lib/utils";
import {
  isRetrievalActionType,
  RetrievalDocumentType,
} from "@app/types/assistant/actions/retrieval";
import {
  AgentMessageType,
  MessageReactionType,
} from "@app/types/assistant/conversation";
import { UserType, WorkspaceType } from "@app/types/user";

export function AgentMessage({
  message,
  owner,
  user,
  conversationId,
  reactions,
}: {
  message: AgentMessageType;
  owner: WorkspaceType;
  user: UserType;
  conversationId: string;
  reactions: MessageReactionType[];
}) {
  const [streamedAgentMessage, setStreamedAgentMessage] =
    useState<AgentMessageType>(message);

  const shouldStream = (() => {
    switch (streamedAgentMessage.status) {
      case "succeeded":
      case "failed":
      case "cancelled":
        return false;
      case "created":
        return true;

      default:
        ((status: never) => {
          throw new Error(`Unknown status: ${status}`);
        })(streamedAgentMessage.status);
    }
  })();

  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
      if (!shouldStream) {
        return null;
      }
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
    [conversationId, message.sId, owner.sId, shouldStream]
  );

  const onEventCallback = useCallback((eventStr: string) => {
    const eventPayload: {
      eventId: string;
      data:
        | AgentErrorEvent
        | AgentActionEvent
        | AgentActionSuccessEvent
        | GenerationTokensEvent
        | AgentGenerationSuccessEvent
        | AgentGenerationCancelledEvent
        | AgentMessageSuccessEvent;
    } = JSON.parse(eventStr);

    const event = eventPayload.data;
    switch (event.type) {
      case "agent_action_success":
      case "retrieval_params":
      case "dust_app_run_params":
      case "dust_app_run_block":
        setStreamedAgentMessage((m) => {
          return { ...m, action: event.action };
        });
        break;
      case "agent_error":
        setStreamedAgentMessage((m) => {
          return { ...m, status: "failed", error: event.error };
        });
        break;

      case "agent_generation_success":
        setStreamedAgentMessage((m) => {
          return { ...m, content: event.text };
        });
        break;

      case "agent_generation_cancelled":
        setStreamedAgentMessage((m) => {
          return { ...m, status: "cancelled" };
        });
        break;

      case "agent_message_success": {
        setStreamedAgentMessage(event.message);
        break;
      }
      case "generation_tokens": {
        setStreamedAgentMessage((m) => {
          const previousContent = m.content || "";
          return { ...m, content: previousContent + event.text };
        });
        break;
      }

      default:
        ((t: never) => {
          console.error("Unknown event type", t);
        })(event);
    }
  }, []);

  useEventSource(buildEventSourceURL, onEventCallback);

  const agentMessageToRender = (() => {
    switch (message.status) {
      case "succeeded":
      case "failed":
      case "cancelled":
        return message;
      case "created":
        return streamedAgentMessage;

      default:
        ((status: never) => {
          throw new Error(`Unknown status: ${status}`);
        })(message.status);
    }
  })();

  useEffect(() => {
    if (
      window &&
      window.scrollTo &&
      agentMessageToRender.status === "created"
    ) {
      if (
        document.body.offsetHeight + window.scrollY >=
        document.body.scrollHeight - 200
      ) {
        window.scrollTo(0, document.body.scrollHeight);
      }
    }
  }, [agentMessageToRender.content, agentMessageToRender.status]);

  // GenerationContext: to know if we are generating or not
  const generationContext = useContext(GenerationContext);
  if (!generationContext) {
    throw new Error(
      "AgentMessage must be used within a GenerationContextProvider"
    );
  }
  useEffect(() => {
    const isInArray = generationContext.generatingMessageIds.includes(
      message.sId
    );
    if (agentMessageToRender.status === "created" && !isInArray) {
      generationContext.setGeneratingMessageIds((s) => [...s, message.sId]);
    } else if (agentMessageToRender.status !== "created" && isInArray) {
      generationContext.setGeneratingMessageIds((s) =>
        s.filter((id) => id !== message.sId)
      );
    }
  }, [agentMessageToRender.status, generationContext, message.sId]);

  const buttons =
    message.status === "failed"
      ? []
      : [
          {
            label: "Copy to clipboard",
            icon: ClipboardIcon,
            onClick: () => {
              void navigator.clipboard.writeText(
                agentMessageToRender.content || ""
              );
            },
          },
          {
            label: "Retry",
            icon: ArrowPathIcon,
            onClick: () => {
              void retryHandler(agentMessageToRender);
            },
          },
        ];

  const [references, setReferences] = useState<{
    [key: string]: RetrievalDocumentType;
  }>({});
  const [activeReferences, setActiveReferences] = useState<
    { index: number; document: RetrievalDocumentType }[]
  >([]);
  function updateActiveReferences(
    document: RetrievalDocumentType,
    index: number
  ) {
    const existingIndex = activeReferences.find((r) => r.index === index);
    if (!existingIndex) {
      setActiveReferences([...activeReferences, { index, document }]);
    }
  }
  const [lastHoveredReference, setLastHoveredReference] = useState<
    number | null
  >(null);
  useEffect(() => {
    if (
      agentMessageToRender.action &&
      isRetrievalActionType(agentMessageToRender.action) &&
      agentMessageToRender.action.documents
    ) {
      setReferences(
        agentMessageToRender.action.documents.reduce((acc, d) => {
          acc[d.reference] = d;
          return acc;
        }, {} as { [key: string]: RetrievalDocumentType })
      );
    }
  }, [agentMessageToRender.action]);

  return (
    <ConversationMessage
      owner={owner}
      user={user}
      conversationId={conversationId}
      messageId={agentMessageToRender.sId}
      pictureUrl={agentMessageToRender.configuration.pictureUrl}
      name={`@${agentMessageToRender.configuration.name}`}
      buttons={buttons}
      avatarBusy={agentMessageToRender.status === "created"}
      reactions={reactions}
    >
      {renderMessage(agentMessageToRender, references, shouldStream)}
    </ConversationMessage>
  );

  function renderMessage(
    agentMessage: AgentMessageType,
    references: { [key: string]: RetrievalDocumentType },
    streaming: boolean
  ) {
    // Display the error to the user so they can report it to us (or some can be
    // understandable directly to them)
    if (agentMessage.status === "failed") {
      return (
        <ErrorMessage
          error={
            agentMessage.error || {
              message: "Unexpected Error",
              code: "unexpected_error",
            }
          }
          retryHandler={async () => await retryHandler(agentMessage)}
        />
      );
    }

    // Loading state (no action nor text yet)
    if (
      agentMessage.status === "created" &&
      !agentMessage.action &&
      (!agentMessage.content || agentMessage.content === "")
    ) {
      return (
        <div>
          <div className="pb-2 text-xs font-bold text-element-600">
            I'm thinking...
          </div>
          <Spinner size="sm" />
        </div>
      );
    }

    return (
      <>
        {agentMessage.action && (
          <div
            className={
              agentMessage.content && agentMessage.content !== ""
                ? "border-b border-dashed border-structure-300"
                : ""
            }
          >
            <AgentAction action={agentMessage.action} />
          </div>
        )}
        {agentMessage.content && agentMessage.content !== "" && (
          <div className={agentMessage.action ? "pt-4" : ""}>
            <RenderMessageMarkdown
              content={agentMessage.content}
              blinkingCursor={streaming}
              citationsContext={{
                references,
                updateActiveReferences,
                setHoveredReference: setLastHoveredReference,
              }}
            />
            <Citations
              activeReferences={activeReferences}
              lastHoveredReference={lastHoveredReference}
            />
          </div>
        )}
        {agentMessage.status === "cancelled" && (
          <Chip
            label="Message generation was cancelled"
            size="xs"
            className="mt-4"
          />
        )}
      </>
    );
  }

  async function retryHandler(agentMessage: AgentMessageType) {
    await fetch(
      `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${agentMessage.sId}/retry`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

function Citations({
  activeReferences,
  lastHoveredReference,
}: {
  activeReferences: { index: number; document: RetrievalDocumentType }[];
  lastHoveredReference: number | null;
}) {
  const citationContainer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (citationContainer.current) {
      if (lastHoveredReference !== null) {
        citationContainer.current.scrollTo({
          left: citationsScrollOffset(lastHoveredReference),
          behavior: "smooth",
        });
      }
    }
  }, [lastHoveredReference]);

  function citationsScrollOffset(reference: number | null) {
    if (!citationContainer.current || reference === null) {
      return 0;
    }
    const offset = (
      citationContainer.current.firstElementChild
        ?.firstElementChild as HTMLElement
    ).offsetLeft;
    const scrolling =
      (citationContainer.current.firstElementChild?.firstElementChild
        ?.scrollWidth || 0) *
      (reference - 2);
    return scrolling - offset;
  }

  activeReferences.sort((a, b) => a.index - b.index);
  return (
    <div
      className="-mx-[100%] mt-9 overflow-x-auto px-[100%] scrollbar-hide"
      ref={citationContainer}
    >
      <div className="left-100 relative flex gap-2">
        {activeReferences.map(({ document, index }) => {
          const provider = providerFromDocument(document);
          return (
            <div
              className={classNames(
                "flex w-48 flex-none flex-col gap-2 rounded-xl border border-structure-100 p-3 sm:w-64",
                lastHoveredReference === index
                  ? "animate-[bgblink_500ms_3]"
                  : ""
              )}
              key={index}
            >
              <div className="flex items-center gap-1.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-full border border-violet-200 bg-violet-100 text-xs font-semibold text-element-800">
                  {index}
                </div>
                <div className="h-5 w-5">
                  {provider === "none" ? (
                    <DocumentTextIcon className="h-5 w-5 text-slate-500" />
                  ) : (
                    <img
                      src={PROVIDER_LOGO_PATH[providerFromDocument(document)]}
                      className="h-5 w-5"
                    />
                  )}
                </div>
                <div className="flex-grow text-xs" />
                <Link href={linkFromDocument(document)} target="_blank">
                  <IconButton
                    icon={ExternalLinkIcon}
                    size="xs"
                    variant="primary"
                  />
                </Link>
              </div>
              <div className="text-xs font-bold text-element-900">
                {titleFromDocument(document)}
              </div>
            </div>
          );
        })}
        <div className="h-1 w-[100%] flex-none" />
      </div>
    </div>
  );
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
  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-1 sm:flex-row">
        <Chip
          color="warning"
          label={"ERROR: " + shortText(error.message)}
          size="xs"
        />
        <DropdownMenu>
          <DropdownMenu.Button>
            <Button
              variant="tertiary"
              size="xs"
              icon={EyeIcon}
              label="See the error"
            />
          </DropdownMenu.Button>
          <div className="relative bottom-6 z-30">
            <DropdownMenu.Items origin="topLeft" width={320}>
              <div className="flex flex-col gap-3 px-4 pb-3 pt-5">
                <div className="text-sm font-normal text-warning-800">
                  {fullMessage}
                </div>
                <div className="self-end">
                  <Button
                    variant="tertiary"
                    size="xs"
                    icon={DocumentDuplicateIcon}
                    label={"Copy"}
                    onClick={() =>
                      void navigator.clipboard.writeText(fullMessage)
                    }
                  />
                </div>
              </div>
            </DropdownMenu.Items>
          </div>
        </DropdownMenu>
      </div>
      <div className="self-center">
        <Button
          variant="primary"
          size="sm"
          icon={ArrowPathIcon}
          label="Retry"
          onClick={retryHandler}
        />
      </div>
    </div>
  );
}

function shortText(text: string, maxLength = 30) {
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
}
