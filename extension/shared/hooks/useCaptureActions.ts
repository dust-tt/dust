import { useExtensionConfig } from "@app/lib/swr/extension";
import type { LightWorkspaceType } from "@app/types/user";
import { useCurrentUrlAndDomain } from "@extension/shared/hooks/useCurrentDomain";
import type { CaptureActions } from "@extension/shared/services/platform";
import { useCallback, useMemo } from "react";

export function useCaptureActions(
  workspace: LightWorkspaceType,
  uploadContentTab: (options: {
    includeContent: boolean;
    includeCapture: boolean;
  }) => Promise<unknown>,
  isCapturing: boolean
): CaptureActions | undefined {
  const { currentDomain, currentUrl } = useCurrentUrlAndDomain();
  const { blacklistedDomains } = useExtensionConfig(workspace);

  const handleCapture = useCallback(
    (type: "text" | "screenshot") => {
      if (type === "text") {
        void uploadContentTab({
          includeContent: true,
          includeCapture: false,
        });
        return;
      }

      void uploadContentTab({
        includeContent: false,
        includeCapture: true,
      });
    },
    [uploadContentTab]
  );

  const isEnabled = useMemo(() => {
    if (currentDomain === "chrome" || currentDomain === "firefox-internal") {
      return false;
    }

    return !blacklistedDomains.some((d: string) =>
      d.startsWith("http://") || d.startsWith("https://")
        ? currentUrl.startsWith(d)
        : currentDomain.endsWith(d)
    );
  }, [currentDomain, currentUrl, blacklistedDomains]);

  return useMemo(
    () => (isEnabled ? { onCapture: handleCapture, isCapturing } : undefined),
    [handleCapture, isCapturing, isEnabled]
  );
}
