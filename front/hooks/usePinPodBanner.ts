import { ConfirmContext } from "@app/components/Confirm";
import { useUpdatePodMetadata } from "@app/lib/swr/pods";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useContext } from "react";

type PinPodBannerOptions = {
  fileName?: string;
};

export function usePinPodBanner({
  owner,
  podId: podId,
  pinnedFramePath,
  isEditor,
}: {
  owner: LightWorkspaceType;
  podId: string;
  pinnedFramePath: string | null;
  isEditor: boolean;
}) {
  const confirm = useContext(ConfirmContext);
  const updatePodMetadata = useUpdatePodMetadata({
    owner,
    podId: podId,
  });

  const pinFrame = useCallback(
    async (path: string, options?: PinPodBannerOptions) => {
      if (!isEditor) {
        return;
      }

      const label = options?.fileName ?? path.split("/").pop() ?? path;

      const confirmed = await confirm({
        title: "Pin as Pod banner?",
        message: `"${label}" will appear at the top of this Pod for all members.`,
        validateLabel: "Pin",
        validateVariant: "primary",
      });
      if (!confirmed) {
        return;
      }

      await updatePodMetadata({ pinnedFramePath: path });
    },
    [confirm, isEditor, updatePodMetadata]
  );

  const unpinFrame = useCallback(
    async (options?: PinPodBannerOptions) => {
      if (!isEditor) {
        return;
      }

      const label = options?.fileName
        ? `"${options.fileName}"`
        : "The pinned banner";

      const confirmed = await confirm({
        title: "Unpin Pod banner?",
        message: `${label} will no longer appear at the top of this Pod.`,
        validateLabel: "Unpin",
        validateVariant: "warning",
      });
      if (!confirmed) {
        return;
      }

      await updatePodMetadata({ pinnedFramePath: null });
    },
    [confirm, isEditor, updatePodMetadata]
  );

  const togglePin = useCallback(
    async (path: string, options?: PinPodBannerOptions) => {
      if (!isEditor) {
        return;
      }
      if (pinnedFramePath === path) {
        await unpinFrame(options);
      } else {
        await pinFrame(path, options);
      }
    },
    [isEditor, pinFrame, pinnedFramePath, unpinFrame]
  );

  const isPinned = useCallback(
    (path: string) => pinnedFramePath === path,
    [pinnedFramePath]
  );

  return {
    pinFrame,
    unpinFrame,
    togglePin,
    isPinned,
    pinnedFramePath,
  };
}
