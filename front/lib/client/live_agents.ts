import type { LiveAgent, LiveAgentActivity } from "@app/types/collab";
import { liveAgentServerMessageSchema } from "@app/types/collab";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
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
  const onStateless = ({ payload }: { payload: string }) => {
    const json = safeParseJSON(payload);
    const message = json.isOk()
      ? liveAgentServerMessageSchema.safeParse(json.value)
      : null;
    if (message?.success) {
      listener({ agent: message.data.agent, activity: message.data.activity });
    }
  };
  provider.on("stateless", onStateless);
  return () => {
    provider.off("stateless", onStateless);
  };
}
