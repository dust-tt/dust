import { USER_MEMORY_SERVER_NAME } from "@app/lib/api/actions/servers/user_memory/metadata";
import type { MessageStreamEvent } from "@app/lib/api/assistant/pubsub";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type { AgentContentItemType } from "@app/types/assistant/agent_message_content";
import { isAgentFunctionCallContent } from "@app/types/assistant/agent_message_content";

export const REDACTED_USER_MEMORY_TEXT =
  "Personal memory is hidden from other conversation participants.";

function isUserMemoryAction(action: AgentMCPActionWithOutputType): boolean {
  return action.internalMCPServerName === USER_MEMORY_SERVER_NAME;
}

export function redactUserMemoryAction(
  action: AgentMCPActionWithOutputType
): AgentMCPActionWithOutputType {
  if (!isUserMemoryAction(action)) {
    return action;
  }

  return {
    ...action,
    params: {},
    output: [{ type: "text" as const, text: REDACTED_USER_MEMORY_TEXT }],
    generatedFiles: [],
    citations: null,
  };
}

export function redactUserMemoryActions(
  actions: AgentMCPActionWithOutputType[]
): AgentMCPActionWithOutputType[] {
  return actions.map(redactUserMemoryAction);
}

export function getUserMemoryFunctionCallIds(
  actions: AgentMCPActionWithOutputType[]
): Set<string> {
  return new Set(
    actions.filter(isUserMemoryAction).map((a) => a.functionCallId)
  );
}

export function redactUserMemoryStepContent(
  content: AgentContentItemType,
  redactedFunctionCallIds: Set<string>
): AgentContentItemType {
  if (
    !isAgentFunctionCallContent(content) ||
    !redactedFunctionCallIds.has(content.value.id)
  ) {
    return content;
  }

  return {
    ...content,
    value: { ...content.value, arguments: "{}" },
  };
}

export function redactUserMemoryFromMessageStreamEvent(
  event: MessageStreamEvent
): MessageStreamEvent {
  const { data } = event;
  if (!("action" in data) || !isUserMemoryAction(data.action)) {
    return event;
  }

  return {
    ...event,
    data: { ...data, action: redactUserMemoryAction(data.action) },
  };
}
