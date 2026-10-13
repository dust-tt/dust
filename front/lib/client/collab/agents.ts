import { onStatelessMessage } from "@app/lib/client/collab/messages";
import type {
  CollabAgent,
  AgentActivity,
  AgentEditMessage,
} from "@app/types/collab";
import {
  agentEditMessageSchema,
  agentActivityMessageSchema,
} from "@app/types/collab";
import type { HocuspocusProvider } from "@hocuspocus/provider";

export interface AgentEvent {
  agent: CollabAgent;
  activity: AgentActivity;
}

/**
 * @cc [owner:PopDaph,label:product] collab-agent-activity-listener
 * `listener` MUST be called with every agent activity the server sends on `provider`, in the
 * order received, and never after the returned function is called. Any other stateless message
 * MUST be ignored.
 */
export function onAgentActivity(
  provider: HocuspocusProvider,
  listener: (event: AgentEvent) => void
): () => void {
  return onStatelessMessage(
    provider,
    agentActivityMessageSchema,
    ({ agent, activity }) => listener({ agent, activity })
  );
}

/**
 * @cc [owner:PopDaph,label:product] collab-agent-edit-listener
 * `listener` MUST be called with every agent edit the server announces on `provider`, in the order
 * received, and never after the returned function is called. Any other stateless message MUST be
 * ignored.
 */
export function onAgentEdit(
  provider: HocuspocusProvider,
  listener: (edit: AgentEditMessage) => void
): () => void {
  return onStatelessMessage(provider, agentEditMessageSchema, listener);
}
