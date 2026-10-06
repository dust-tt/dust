import { useArchiveSkill } from "@app/lib/swr/skill_configurations";
import type { SkillWithoutInstructionsAndToolsWithRelationsType } from "@app/types/assistant/skill_configuration";
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
import { Plural, Trans, useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
  const [isArchiving, setIsArchiving] = useState(false);
  const doArchive = useArchiveSkill({ owner, skill: skill });
  const agentsUsageCount = skill.relations.usage.agents.length;
  const skillsUsageCount = skill.relations.usage.skills.length;
  const skillName = skill.name;

  const getDescription = () => {
    if (agentsUsageCount > 0 && skillsUsageCount > 0) {
      return (
        <Trans>
          This will archive the skill{" "}
          <span className="font-bold">{skillName}</span> used by{" "}
          <Plural value={agentsUsageCount} one="# agent" other="# agents" /> and{" "}
          <Plural value={skillsUsageCount} one="# skill" other="# skills" />.
        </Trans>
      );
    }
    if (agentsUsageCount > 0) {
      return (
        <Trans>
          This will archive the skill{" "}
          <span className="font-bold">{skillName}</span> used by{" "}
          <Plural value={agentsUsageCount} one="# agent" other="# agents" />.
        </Trans>
      );
    }
    if (skillsUsageCount > 0) {
      return (
        <Trans>
          This will archive the skill{" "}
          <span className="font-bold">{skillName}</span> used by{" "}
          <Plural value={skillsUsageCount} one="# skill" other="# skills" />.
        </Trans>
      );
    }
    return (
      <Trans>
        This will archive the skill{" "}
        <span className="font-bold">{skillName}</span> for everyone.
      </Trans>
    );
  };

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
          <DialogTitle>
            <Trans>Archiving the skill</Trans>
          </DialogTitle>
          <DialogDescription>
            <div>{getDescription()}</div>
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="text-sm font-medium">
            <Trans>Are you sure you want to proceed?</Trans>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: t`Cancel`,
            disabled: isArchiving,
            variant: "outline",
          }}
          rightButtonProps={{
            label: t`Archive for everyone`,
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
