import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";

export const TERMINAL_AGENT_MESSAGE_EVENT_TYPES: readonly AgentMessageEvents["type"][] =
  [
    "agent_message_success",
    "agent_message_gracefully_stopped",
    "agent_generation_cancelled",
    "agent_error",
    "tool_error",
  ];
