import type { LiveAgentEvent } from "@app/lib/client/live_agents";
import { onLiveAgentActivity } from "@app/lib/client/live_agents";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { useEffect, useState } from "react";

// Long enough for the model to write most changes after reading, short enough not to linger once an
// agent answers without editing: the session has no "done" signal.
const READING_SHOWN_MS = 20_000;
// Long enough for the edit's playback to finish.
const EDITING_SHOWN_MS = 4_000;

/**
 * @cc [owner:PopDaph,label:product] live-agent-activity-shown
 * The activity MUST be the last one the session announced on `provider`, for
 * `READING_SHOWN_MS` after a read and `EDITING_SHOWN_MS` after an edit, then none. A new provider
 * MUST start with none.
 */
export function useLiveAgentActivity(
  provider: HocuspocusProvider | null
): LiveAgentEvent | null {
  // Kept with its provider: until the effect's cleanup runs, a new provider would see the old one's.
  const [shown, setShown] = useState<{
    provider: HocuspocusProvider;
    event: LiveAgentEvent;
  } | null>(null);

  useEffect(() => {
    if (!provider) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onLiveAgentActivity(provider, (event) => {
      clearTimeout(timer);
      setShown({ provider, event });
      timer = setTimeout(
        () => setShown(null),
        event.activity === "editing" ? EDITING_SHOWN_MS : READING_SHOWN_MS
      );
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
      setShown(null);
    };
  }, [provider]);

  return shown?.provider === provider ? shown.event : null;
}
