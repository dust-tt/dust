import { onStatelessMessage } from "@app/lib/client/live_session";
import type {
  LiveAgent,
  LiveAgentActivity,
  LiveAttributionMessage,
} from "@app/types/collab";
import {
  liveAttributionMessageSchema,
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
 * @cc [owner:PopDaph,label:product] live-attribution-listener
 * `listener` MUST be called with every attribution the server sends on `provider`, in the order
 * received, and never after the returned function is called. Any other stateless message MUST be
 * ignored.
 */
export function onLiveAttribution(
  provider: HocuspocusProvider,
  listener: (attribution: LiveAttributionMessage) => void
): () => void {
  return onStatelessMessage(provider, liveAttributionMessageSchema, listener);
}
