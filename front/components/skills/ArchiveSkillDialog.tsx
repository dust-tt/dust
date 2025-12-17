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

import { useArchiveSkill } from "@app/lib/swr/skill_configurations";
import type { LightWorkspaceType } from "@app/types";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";

interface DeleteSkillDialogProps {
  skillConfiguration: SkillWithRelationsType;
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}

export function ArchiveSkillDialog({
  skillConfiguration,
  isOpen,
  onClose,
  owner,
}: DeleteSkillDialogProps) {
  const [isArchiving, setIsArchiving] = useState(false);
  const doArchive = useArchiveSkill({ owner, skillConfiguration });

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
          <DialogTitle>Archiving the skill</DialogTitle>
          <DialogDescription>
            <div>
              This will archive the skill{" "}
              <span className="font-bold">{skillConfiguration?.name}</span> for
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
            disabled: isArchiving,
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Archive for everyone",
            disabled: isArchiving,
            variant: "warning",
            onClick: async (e: React.MouseEvent) => {
              e.preventDefault();
              setIsArchiving(true);
              await doArchive();
              setIsArchiving(false);
              onClose();
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
