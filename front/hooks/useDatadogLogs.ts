import { datadogLogs } from "@datadog/browser-logs";
import { useEffect } from "react";

import { useAuth } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";

export function useDatadogLogs() {
  const { user } = useAuth();
  const userId = user?.sId;

  const router = useAppRouter();
  const { wId } = router.query;

  useEffect(() => {
    if (userId) {
      datadogLogs.setUser({
        id: userId,
      });
      window.DD_RUM?.onReady(() => {
        window.DD_RUM?.setUser({
          id: user.sId,
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (wId && !Array.isArray(wId)) {
      datadogLogs.setGlobalContext({
        workspaceId: wId,
      });
      window.DD_RUM?.onReady(() => {
        window.DD_RUM?.setGlobalContext({
          workspaceId: wId,
        });
      });
    } else {
      datadogLogs.setGlobalContext({});
      window.DD_RUM?.onReady(() => {
        window.DD_RUM?.setGlobalContext({});
      });
    }
  }, [wId]);
}
