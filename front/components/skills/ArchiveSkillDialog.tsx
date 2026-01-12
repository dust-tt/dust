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
import { pluralize } from "@app/types";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";

interface DeleteSkillDialogProps {
  skill: SkillWithRelationsType;
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}

export function ArchiveSkillDialog({
  skill,
  isOpen,
  onClose,
  owner,
}: DeleteSkillDialogProps) {
  const [isArchiving, setIsArchiving] = useState(false);
  const doArchive = useArchiveSkill({ owner, skill: skill });

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
              <span className="font-bold">{skill?.name}</span>{" "}
              {skill.relations.usage.count === 0
                ? "for everyone."
                : `used by ${skill.relations.usage.count} agent${pluralize(skill.relations.usage.count)}.`}
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
