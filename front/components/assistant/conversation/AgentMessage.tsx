import { Avatar } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

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

    const esURL = `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${message.sId}/events`;
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
            return { ...m, content: m.content + event.text };
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
    <>
      <div className="flex-shrink-0">
        {agentMessageToRender.configuration.pictureUrl && (
          <Avatar
            visual={agentMessageToRender.configuration.pictureUrl}
            size="sm"
          />
        )}
      </div>
      <div className="flex-grow">
        <div className="flex flex-col gap-4">
          <div className="text-sm font-medium">
            {agentMessageToRender.configuration.name}
          </div>
          <div className="text-base font-normal">
            {agentMessageToRender.content}
          </div>
        </div>
      </div>
    </>
  );
}
