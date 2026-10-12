import { onStatelessMessage } from "@app/lib/client/live_session";
import type {
  LiveAgent,
  LiveAgentActivity,
  LiveAgentEditMessage,
} from "@app/types/collab";
import {
  liveAgentEditMessageSchema,
  liveAgentServerMessageSchema,
} from "@app/types/collab";
import type { HocuspocusProvider } from "@hocuspocus/provider";

export interface LiveAgentEvent {
  agent: LiveAgent;
  activity: LiveAgentActivity;
}

/**
 * @cc [owner:PopDaph,label:product] live-agent-activity-listener
 * `listener` MUST be called with every agent activity the server sends on `provider`, in the
 * order received, and never after the returned function is called. Any other stateless message
 * MUST be ignored.
 */
export function onLiveAgentActivity(
  provider: HocuspocusProvider,
  listener: (event: LiveAgentEvent) => void
): () => void {
  return onStatelessMessage(
    provider,
    liveAgentServerMessageSchema,
    ({ agent, activity }) => listener({ agent, activity })
  );
}

/**
 * @cc [owner:PopDaph,label:product] live-agent-edit-listener
 * `listener` MUST be called with every agent edit the server announces on `provider`, in the order
 * received, and never after the returned function is called. Any other stateless message MUST be
 * ignored.
 */
export function onLiveAgentEdit(
  provider: HocuspocusProvider,
  listener: (edit: LiveAgentEditMessage) => void
): () => void {
  return onStatelessMessage(provider, liveAgentEditMessageSchema, listener);
}
