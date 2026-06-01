import { useArchiveSkill } from "@app/lib/swr/skill_configurations";
import type { SkillWithoutInstructionsAndToolsWithRelationsType } from "@app/types/assistant/skill_configuration";
import { removeNulls } from "@app/types/shared/utils/general";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
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

interface DeleteSkillDialogProps {
  skill: SkillWithoutInstructionsAndToolsWithRelationsType;
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
  const agentsUsageCount = skill.relations.usage.agents.length;
  const skillsUsageCount = skill.relations.usage.skills?.length ?? 0;
  const usageLabels = removeNulls([
    agentsUsageCount > 0
      ? `${agentsUsageCount} agent${pluralize(agentsUsageCount)}`
      : null,
    skillsUsageCount > 0
      ? `${skillsUsageCount} skill${pluralize(skillsUsageCount)}`
      : null,
  ]);

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
              {usageLabels.length === 0
                ? "for everyone."
                : `used by ${usageLabels.join(" and ")}.`}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="text-sm font-medium">
            Are you sure you want to proceed?
          </div>
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
            isLoading: isArchiving,
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
