import { useAuth } from "@app/lib/auth/AuthContext";
import { useRegionContext } from "@app/lib/auth/RegionContext";
import { useAppRouter } from "@app/lib/platform";
import { datadogLogs } from "@datadog/browser-logs";
import { useEffect } from "react";

const CELL = import.meta.env?.VITE_DUST_CELL;

export function useDatadogLogs() {
  const { user } = useAuth();
  const userId = user?.sId;

  const router = useAppRouter();
  const { wId } = router.query;

  const { regionInfo } = useRegionContext();
  const region = regionInfo.name;

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
    const globalContext: Record<string, string> = { region };
    if (CELL) {
      globalContext.cell = CELL;
    }
    if (wId && !Array.isArray(wId)) {
      globalContext.workspaceId = wId;
    }

    datadogLogs.setGlobalContext(globalContext);
    window.DD_RUM?.onReady(() => {
      window.DD_RUM?.setGlobalContext(globalContext);
    });
  }, [wId, region]);
}
