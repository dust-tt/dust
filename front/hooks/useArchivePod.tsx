import { ConfirmContext } from "@app/components/Confirm";
import { useUpdatePodMetadata } from "@app/lib/swr/pods";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useContext } from "react";

export function useArchivePod({
  owner,
  podId,
  onSuccess,
}: {
  owner: LightWorkspaceType;
  podId: string;
  onSuccess?: () => void;
}) {
  const confirm = useContext(ConfirmContext);
  const doUpdateMetadata = useUpdatePodMetadata({ owner, podId });

  const archivePod = useCallback(async () => {
    const confirmed = await confirm({
      title: "Archive Pod?",
      message:
        "You'll no longer be able to create new conversations in this Pod and it will be hidden from the sidebar. Triggers targeting this Pod will be disabled. However, existing content can still be used by agents. Unarchive to restore access.",
      validateVariant: "warning",
    });

    if (!confirmed) {
      return;
    }

    await doUpdateMetadata({ archive: true });
    onSuccess?.();
  }, [confirm, doUpdateMetadata, onSuccess]);

  const unarchivePod = useCallback(async () => {
    await doUpdateMetadata({ archive: false });
  }, [doUpdateMetadata]);

  return { archivePod, unarchivePod };
}
