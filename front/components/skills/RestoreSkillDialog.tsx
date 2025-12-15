import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useRestoreSkillConfiguration } from "@app/lib/swr/skill_configurations";
import type { LightWorkspaceType } from "@app/types";
import type { SkillConfigurationType } from "@app/types/assistant/skill_configuration";

interface RestoreSkillDialogProps {
  skillConfiguration: SkillConfigurationType;
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}

export function RestoreSkillDialog({
  skillConfiguration,
  isOpen,
  onClose,
  owner,
}: RestoreSkillDialogProps) {
  const [isRestoring, setIsRestoring] = useState(false);
  const doRestore = useRestoreSkillConfiguration({ owner, skillConfiguration });

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="md" isAlertDialog>
        <DialogHeader hideButton>
          <DialogTitle>Restoring the skill</DialogTitle>
          <DialogDescription>
            <div>
              This will restore the skill{" "}
              <span className="font-bold">{skillConfiguration.name}</span> for
              everyone.
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="font-bold">Are you sure you want to proceed?</div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            disabled: isRestoring,
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Restore the skill",
            disabled: isRestoring,
            variant: "warning",
            onClick: async (e: React.MouseEvent) => {
              e.preventDefault();
              setIsRestoring(true);
              await doRestore();
              setIsRestoring(false);
              onClose();
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
