import { useAuth } from "@app/lib/auth/AuthContext";
import { useCellContext } from "@app/lib/auth/CellContext";
import { useAppRouter } from "@app/lib/platform";
import { datadogLogs } from "@datadog/browser-logs";
import { useEffect } from "react";

export function useDatadogLogs() {
  const { user } = useAuth();
  const userId = user?.sId;

  const router = useAppRouter();
  const { wId } = router.query;

  const { cellInfo } = useCellContext();

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
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
    const globalContext: Record<string, string> = {
      region: cellInfo.region,
      cell: cellInfo.name,
    };
    if (wId && !Array.isArray(wId)) {
      globalContext.workspaceId = wId;
    }

    datadogLogs.setGlobalContext(globalContext);
    window.DD_RUM?.onReady(() => {
      window.DD_RUM?.setGlobalContext(globalContext);
    });
  }, [wId, cellInfo.region, cellInfo.name]);
}
