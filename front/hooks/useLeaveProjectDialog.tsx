import { useLeaveProject } from "@app/lib/swr/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

interface UseLeaveProjectDialogProps {
  owner: LightWorkspaceType;
  spaceId: string;
  spaceName: string;
  isRestricted: boolean;
  userName: string;
  onSuccess?: () => void;
}

export function useLeaveProjectDialog({
  owner,
  spaceId,
  spaceName,
  isRestricted,
  userName,
  onSuccess,
}: UseLeaveProjectDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const doLeave = useLeaveProject({
    owner,
    spaceId,
    spaceName,
    userName,
  });

  const handleLeave = useCallback(async () => {
    setIsLeaving(true);
    const success = await doLeave();
    setIsLeaving(false);
    if (success) {
      setIsOpen(false);
      onSuccess?.();
    }
  }, [doLeave, onSuccess]);

  const openDialog = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
  }, []);

  const leaveDialogProps = {
    isOpen,
    isLeaving,
    isRestricted,
    onClose: closeDialog,
    onLeave: handleLeave,
    spaceName,
  };

  return {
    leaveDialogProps,
    openLeaveDialog: openDialog,
  };
}
