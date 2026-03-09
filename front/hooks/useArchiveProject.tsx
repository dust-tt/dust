import { ConfirmContext } from "@app/components/Confirm";
import { useUpdateProjectMetadata } from "@app/lib/swr/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useContext } from "react";

interface UseArchiveProjectProps {
  owner: LightWorkspaceType;
  spaceId: string;
  onSuccess?: () => void;
}

export function useArchiveProject({
  owner,
  spaceId,
  onSuccess,
}: UseArchiveProjectProps) {
  const confirm = useContext(ConfirmContext);
  const doUpdateMetadata = useUpdateProjectMetadata({ owner, spaceId });

  const archiveProject = useCallback(async () => {
    const confirmed = await confirm({
      title: "Archive project?",
      message:
        "You'll no longer be able to create new conversations in this project and it will be hidden from the sidebar. However, existing content can still be used by agents. Unarchive it to get back access to it.",
      validateVariant: "warning",
    });

    if (!confirmed) {
      return;
    }

    await doUpdateMetadata({ archive: true });
    onSuccess?.();
  }, [confirm, doUpdateMetadata, onSuccess]);

  const unarchiveProject = useCallback(async () => {
    await doUpdateMetadata({ archive: false });
  }, [doUpdateMetadata]);

  return { archiveProject, unarchiveProject };
}
