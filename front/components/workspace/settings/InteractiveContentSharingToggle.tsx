import { useFrameSharingToggle } from "@app/hooks/useFrameSharingToggle";
import type { WorkspaceType } from "@app/types/user";
import {
  ActionFrameIcon,
  ContextItem,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useState } from "react";

export function InteractiveContentSharingToggle({
  owner,
}: {
  owner: WorkspaceType;
}) {
  const { isEnabled, isChanging, doToggleInteractiveContentSharing } =
    useFrameSharingToggle({ owner });
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const handleToggleClick = () => {
    if (isEnabled) {
      setIsConfirmOpen(true);
    } else {
      void doToggleInteractiveContentSharing();
    }
  };

  return (
    <>
      <ContextItem
        title="Public Frame sharing"
        subElement="Allow Frames to be shared publicly via links"
        visual={<ActionFrameIcon className="h-6 w-6" />}
        hasSeparatorIfLast={true}
        action={
          <SliderToggle
            selected={isEnabled}
            disabled={isChanging}
            onClick={handleToggleClick}
          />
        }
      />
      <Dialog
        open={isConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsConfirmOpen(false);
          }
        }}
      >
        <DialogContent size="md" isAlertDialog>
          <DialogHeader hideButton>
            <DialogTitle>Disable public Frame sharing</DialogTitle>
            <DialogDescription>
              This will revoke public access to all currently shared Frames in
              this workspace. Existing public links will stop working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              disabled: isChanging,
              variant: "outline",
            }}
            rightButtonProps={{
              label: "Disable public sharing",
              disabled: isChanging,
              variant: "warning",
              onClick: async () => {
                await doToggleInteractiveContentSharing();
                setIsConfirmOpen(false);
              },
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
