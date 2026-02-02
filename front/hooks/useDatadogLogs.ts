import { datadogLogs } from "@datadog/browser-logs";
import { useEffect } from "react";

import { useAppRouter } from "@app/lib/platform";
import { useUser } from "@app/lib/swr/user";

export function useDatadogLogs() {
  const { user } = useUser();
  const userId = user?.sId;

  const router = useAppRouter();
  const { wId } = router.query;

  /* eslint-disable react-you-might-not-need-an-effect/no-derived-state */
  useEffect(() => {
    if (userId) {
      datadogLogs.setUser({
        id: userId,
      });
      window.DD_RUM.onReady(() => {
        window.DD_RUM.setUser({
          id: user.sId,
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  /* eslint-enable react-you-might-not-need-an-effect/no-derived-state */

  /* eslint-disable react-you-might-not-need-an-effect/no-derived-state */
  useEffect(() => {
    if (wId && !Array.isArray(wId)) {
      datadogLogs.setGlobalContext({
        workspaceId: wId,
      });
      window.DD_RUM.onReady(() => {
        window.DD_RUM.setGlobalContext({
          workspaceId: wId,
        });
      });
    } else {
      datadogLogs.setGlobalContext({});
      window.DD_RUM.onReady(() => {
        window.DD_RUM.setGlobalContext({});
      });
    }
  }, [wId]);
  /* eslint-enable react-you-might-not-need-an-effect/no-derived-state */
}
