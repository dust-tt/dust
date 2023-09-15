import { Spinner } from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

import { AgentAction } from "@app/components/assistant/conversation/AgentAction";
import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";
import { RenderMarkdown } from "@app/components/RenderMarkdown";
import {
  AgentActionEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationSuccessEvent,
  AgentMessageSuccessEvent,
} from "@app/lib/api/assistant/agent";
import { GenerationTokensEvent } from "@app/lib/api/assistant/generation";
import { AgentMessageType } from "@app/types/assistant/conversation";
import { WorkspaceType } from "@app/types/user";

export function AgentMessage({
  message,
  owner,
  conversationId,
}: {
  message: AgentMessageType;
  owner: WorkspaceType;
  conversationId: string;
}) {
  // State used to re-connect to the events stream; this is a hack to re-trigger
  // the useEffect that set-up the EventSource to the streaming endpoint.
  const [reconnectCounter, setReconnectCounter] = useState(0);
  const lastEventId = useRef<string | null>(null);

  const [streamedAgentMessage, setStreamedAgentMessage] =
    useState<AgentMessageType>(message);

  useEffect(() => {
    // Using a Switch to make sure we handle all the possible status.
    switch (message.status) {
      case "succeeded":
      case "failed":
        return;
      case "created":
        break;

      default:
        ((status: never) => {
          throw new Error(`Unknown status: ${status}`);
        })(message.status);
    }

    const esURL = `/api/w/${
      owner.sId
    }/assistant/conversations/${conversationId}/messages/${
      message.sId
    }/events?lastEventId=${lastEventId.current ? lastEventId.current : ""}`;
    const es = new EventSource(esURL);
    es.onmessage = (messageEvent: MessageEvent<string>) => {
      const eventPayload: {
        eventId: string;
        data:
          | AgentErrorEvent
          | AgentActionEvent
          | AgentActionSuccessEvent
          | GenerationTokensEvent
          | AgentGenerationSuccessEvent
          | AgentMessageSuccessEvent;
      } = JSON.parse(messageEvent.data);

      const event = eventPayload.data;
      lastEventId.current = eventPayload.eventId;
      switch (event.type) {
        case "agent_action_success":
        case "retrieval_params":
        case "retrieval_documents":
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
    };

    es.onerror = () => {
      setReconnectCounter((c) => c + 1);
    };

    return () => {
      es.close();
    };
  }, [
    conversationId,
    message.sId,
    message.status,
    owner.sId,
    reconnectCounter,
  ]);

  const agentMessageToRender =
    message.status === "succeeded" ? message : streamedAgentMessage;

  return (
    <ConversationMessage
      pictureUrl={agentMessageToRender.configuration.pictureUrl}
      name={agentMessageToRender.configuration.name}
    >
      {renderMessage(agentMessageToRender)}
    </ConversationMessage>
  );
}

function renderMessage(agentMessage: AgentMessageType) {
  // Display the error to the user so they can report it to us (or some can be
  // understandable directly to them)
  if (agentMessage.status === "failed") {
    return (
      <div>
        <div className="mb-2 text-xs font-bold text-element-600">
          <p>Error Code: {agentMessage.error?.code}</p>
          <p>Error Message: {agentMessage.error?.message}</p>
        </div>
      </div>
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
        <div className="mb-2 text-xs font-bold text-element-600">
          I'm thinking...
        </div>
        <Spinner size="sm" />
      </div>
    );
  }

  // Messages with no action and text
  if (agentMessage.action === null && agentMessage.content) {
    return (
      <>
        <div className="mb-2 text-xs font-bold text-element-600">Answer:</div>
        <div className="mb-2 break-all text-base font-normal">
          <RenderMarkdown content={agentMessage.content} />
        </div>
      </>
    );
  }
  // Messages with action
  if (agentMessage.action) {
    return (
      <>
        <AgentAction action={agentMessage.action} />
        {agentMessage.content && agentMessage.content !== "" && (
          <>
            <div className="mb-2 text-xs font-bold text-element-600">
              Answer:
            </div>
            <div className="mb-2 break-all text-base font-normal">
              <RenderMarkdown content={agentMessage.content} />
            </div>
          </>
        )}
      </>
    );
  }
}
