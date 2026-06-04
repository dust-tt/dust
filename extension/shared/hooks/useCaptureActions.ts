import { useActivePodId } from "@app/hooks/useActivePodId";
import { useExtensionConfig } from "@app/lib/swr/extension";
import { usePodFiles } from "@app/lib/swr/pods";
import type { LightWorkspaceType } from "@app/types/user";
import { useCurrentUrlAndDomain } from "@extension/shared/hooks/useCurrentDomain";
import type {
  CaptureActions,
  SavePageToPodActions,
} from "@extension/shared/services/platform";
import { useCallback, useMemo } from "react";

export function useCaptureActions(
  workspace: LightWorkspaceType,
  uploadContentTab: (options: {
    includeContent: boolean;
    includeCapture: boolean;
  }) => Promise<unknown>,
  isCapturing: boolean,
  savePageToPodActions?: SavePageToPodActions | null
): CaptureActions | undefined {
  const activePodId = useActivePodId();
  const { currentDomain, currentUrl } = useCurrentUrlAndDomain();
  const { blacklistedDomains } = useExtensionConfig(workspace);

  const { refreshPodFiles } = usePodFiles({
    owner: workspace,
    podId: activePodId ?? "",
    disabled: true,
  });

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

  const handleSavePageToPod = useCallback(async () => {
    if (!savePageToPodActions) {
      return;
    }

    if (!activePodId) {
      savePageToPodActions.openSavePageToPodDialog();
      return;
    }

    const saved = await savePageToPodActions.savePageToPod(activePodId);
    if (saved) {
      await refreshPodFiles();
    }
  }, [activePodId, refreshPodFiles, savePageToPodActions]);

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

  return useMemo(() => {
    if (!isEnabled) {
      return undefined;
    }

    return {
      onCapture: handleCapture,
      isCapturing,
      ...(savePageToPodActions
        ? {
            onSavePageToPod: handleSavePageToPod,
            isSavingPageToPod: savePageToPodActions.isSavingPageToPod,
          }
        : {}),
    };
  }, [
    handleCapture,
    handleSavePageToPod,
    isCapturing,
    isEnabled,
    savePageToPodActions,
  ]);
}
