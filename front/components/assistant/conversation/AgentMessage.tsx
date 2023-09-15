import { Spinner } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

import { AgentAction } from "@app/components/assistant/conversation/AgentAction";
import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";
import { RenderMarkdown } from "@app/components/RenderMarkdown";
import { useEventSource } from "@app/hooks/useEventSource";
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
  const [streamedAgentMessage, setStreamedAgentMessage] =
    useState<AgentMessageType>(message);

  const shouldStream = (() => {
    switch (streamedAgentMessage.status) {
      case "succeeded":
      case "failed":
        return false;
      case "created":
        return true;
        break;

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
        | AgentMessageSuccessEvent;
    } = JSON.parse(eventStr);

    const event = eventPayload.data;
    switch (event.type) {
      case "agent_action_success":
      case "retrieval_params":
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
  }, []);
  useEventSource(buildEventSourceURL, onEventCallback);

  const agentMessageToRender = (() => {
    switch (message.status) {
      case "succeeded":
      case "failed":
        return message;
      case "created":
        return streamedAgentMessage;

      default:
        ((status: never) => {
          throw new Error(`Unknown status: ${status}`);
        })(message.status);
    }
  })();

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
        <div className="mb-2">
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
            <div className="mb-2">
              <RenderMarkdown content={agentMessage.content} />
            </div>
          </>
        )}
      </>
    );
  }
}
