import { ConfirmContext } from "@app/components/Confirm";
import { useUpdatePodMetadata } from "@app/lib/swr/pods";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
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
        title: t`Pin as Pod banner?`,
        message: t`"${label}" will appear at the top of this Pod for all members.`,
        validateLabel: t`Pin`,
        validateVariant: "primary",
      });
      if (!confirmed) {
        return;
      }

      await updatePodMetadata({ pinnedFramePath: path });
    },
    [confirm, isEditor, t, updatePodMetadata]
  );

  const unpinFrame = useCallback(
    async (options?: PinPodBannerOptions) => {
      if (!isEditor) {
        return;
      }

      const fileName = options?.fileName;

      const confirmed = await confirm({
        title: t`Unpin Pod banner?`,
        message: fileName
          ? t`"${fileName}" will no longer appear at the top of this Pod.`
          : t`The pinned banner will no longer appear at the top of this Pod.`,
        validateLabel: t`Unpin`,
        validateVariant: "warning",
      });
      if (!confirmed) {
        return;
      }

      await updatePodMetadata({ pinnedFramePath: null });
    },
    [confirm, isEditor, t, updatePodMetadata]
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
