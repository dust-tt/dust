import { datadogLogs } from "@datadog/browser-logs";
import { useRouter } from "next/router";
import { useEffect } from "react";

import { useUser } from "@app/lib/swr/user";

export function useDatadogLogs() {
  const { user } = useUser();
  const userId = user?.sId;

  const router = useRouter();
  const { wId } = router.query;

  useEffect(() => {
    if (userId) {
      datadogLogs.setUser({
        id: userId,
      });
    }
  }, [userId]);

  useEffect(() => {
    if (wId) {
      datadogLogs.setGlobalContext({
        workspaceId: wId,
      });
    } else {
      datadogLogs.setGlobalContext({});
    }
  }, [wId]);
}
