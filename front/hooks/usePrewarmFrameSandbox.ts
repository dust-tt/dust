import { clientFetch } from "@app/lib/egress/client";
import { useEffect } from "react";

/**
 * Waking a Frame's sandbox takes seconds. Start it as the Frame mounts, so the calls it makes once
 * its bundle has loaded find the sandbox running. Best-effort: a failed pre-warm only means the
 * first call wakes the sandbox itself.
 */
export function usePrewarmFrameSandbox({
  workspaceId,
  frameId,
  disabled,
}: {
  workspaceId: string;
  frameId: string | undefined;
  disabled: boolean;
}) {
  useEffect(() => {
    if (disabled || !frameId) {
      return;
    }
    void clientFetch(
      `/api/w/${workspaceId}/frames/${encodeURIComponent(frameId)}/prewarm`,
      { method: "POST" }
    ).catch(() => undefined);
  }, [disabled, frameId, workspaceId]);
}
