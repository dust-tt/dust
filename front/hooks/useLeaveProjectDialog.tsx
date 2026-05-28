import { useLeavePod } from "@app/lib/swr/pods";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

interface UseLeavePodDialogProps {
  owner: LightWorkspaceType;
  podId: string;
  podName: string;
  isRestricted: boolean;
  userName: string;
  onSuccess?: () => void;
}

export function useLeavePodDialog({
  owner,
  podId,
  podName,
  isRestricted,
  userName,
  onSuccess,
}: UseLeavePodDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const doLeave = useLeavePod({
    owner,
    podId: podId,
    podName: podName,
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

  const openDialog = () => {
    setIsOpen(true);
  };

  const closeDialog = () => {
    setIsOpen(false);
  };

  const leaveDialogProps = {
    isOpen,
    isLeaving,
    isRestricted,
    onClose: closeDialog,
    onLeave: handleLeave,
    podName,
  };

  return {
    leaveDialogProps,
    openLeaveDialog: openDialog,
  };
}
