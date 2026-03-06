import type { AgentMessagePublicType } from "@dust-tt/client";
import type { AgentStateClassification, MessageTemporaryState } from "../types";

type AgentEvent = {
  type: string;
  [key: string]: unknown;
};

export function createInitialState(
  message: AgentMessagePublicType
): MessageTemporaryState {
  return {
    message,
    agentState: message.status === "succeeded" ? "done" : "thinking",
    lastUpdated: new Date(),
  };
}

export function messageReducer(
  state: MessageTemporaryState,
  event: AgentEvent
): MessageTemporaryState {
  switch (event.type) {
    case "generation_tokens": {
      const classification = event.classification as string;
      let message = { ...state.message };
      let agentState: AgentStateClassification = state.agentState;

      if (classification === "tokens") {
        message = {
          ...message,
          content: (message.content || "") + (event.text as string),
        };
        agentState = "writing";
      } else if (classification === "chain_of_thought") {
        message = {
          ...message,
          chainOfThought:
            (message.chainOfThought || "") + (event.text as string),
        };
        agentState = "thinking";
      }

      return { ...state, message, agentState, lastUpdated: new Date() };
    }

    case "agent_action_success": {
      const action = event.action as AgentMessagePublicType["actions"][number];
      const updatedActions = [...state.message.actions, action];
      return {
        ...state,
        message: {
          ...state.message,
          actions: updatedActions,
          status: "created",
        },
        lastUpdated: new Date(),
      };
    }

    case "tool_params": {
      return {
        ...state,
        agentState: "acting",
        lastUpdated: new Date(),
      };
    }

    case "tool_notification": {
      return {
        ...state,
        agentState: "acting",
        lastUpdated: new Date(),
      };
    }

    case "agent_error":
    case "tool_error": {
      return {
        ...state,
        message: {
          ...state.message,
          status: "failed",
          error: {
            code: (event.error as { code?: string })?.code || "unknown",
            message:
              (event.error as { message?: string })?.message || "An error occurred",
            metadata: null,
          },
        },
        agentState: "done",
        lastUpdated: new Date(),
      };
    }

    case "agent_generation_cancelled": {
      return {
        ...state,
        message: {
          ...state.message,
          status: "cancelled",
        },
        agentState: "done",
        lastUpdated: new Date(),
      };
    }

    case "agent_message_success": {
      const successMessage = event.message as AgentMessagePublicType;
      return {
        ...state,
        message: successMessage,
        agentState: "done",
        lastUpdated: new Date(),
      };
    }

    default:
      return state;
  }
}
