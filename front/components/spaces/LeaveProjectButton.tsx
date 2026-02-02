import { Button } from "@dust-tt/sparkle";
import { useState } from "react";

import { useAwaitableDialog } from "@app/hooks/useAwaitableDialog";
import { useLeaveProject } from "@app/lib/swr/spaces";
import type { LightWorkspaceType } from "@app/types";

interface LeaveProjectButtonProps {
  owner: LightWorkspaceType;
  spaceId: string;
  spaceName: string;
  onLeaveSuccess?: () => void;
}

export function LeaveProjectButton({
  owner,
  spaceId,
  spaceName,
  onLeaveSuccess,
}: LeaveProjectButtonProps) {
  const [isLeaving, setIsLeaving] = useState(false);
  const doLeave = useLeaveProject({ owner, spaceId });
  const { AwaitableDialog, showDialog } = useAwaitableDialog();

  const handleLeaveClick = async () => {
    const confirmed = await showDialog({
      title: "Leave this project?",
      children: (
        <p>
          You will no longer have access to conversations and context in{" "}
          <strong>{spaceName}</strong>.
        </p>
      ),
      alertDialog: true,
      validateLabel: "Leave",
      validateVariant: "warning",
      cancelLabel: "Cancel",
    });

    if (confirmed) {
      setIsLeaving(true);
      const success = await doLeave();
      setIsLeaving(false);

      if (success && onLeaveSuccess) {
        onLeaveSuccess();
      }
    }
  };

  return (
    <>
      <Button
        variant="primary"
        label="Leave the project"
        onClick={handleLeaveClick}
        isLoading={isLeaving}
      />
      <AwaitableDialog />
    </>
  );
}
