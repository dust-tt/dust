import { useRestoreSkill } from "@app/lib/swr/skill_configurations";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
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
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

interface RestoreSkillDialogProps {
  skill: SkillWithoutInstructionsAndToolsType;
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}

export function RestoreSkillDialog({
  skill,
  isOpen,
  onClose,
  owner,
}: RestoreSkillDialogProps) {
  const { t } = useLingui();
  const [isRestoring, setIsRestoring] = useState(false);
  const doRestore = useRestoreSkill({
    owner,
    skill: skill,
  });
  const skillName = skill.name;

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
            <Trans>Restoring the skill</Trans>
          </DialogTitle>
          <DialogDescription>
            <div>
              <Trans>
                This will restore the skill{" "}
                <span className="font-bold">{skillName}</span> for everyone.
              </Trans>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="font-bold">
            <Trans>Are you sure you want to proceed?</Trans>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: t`Cancel`,
            disabled: isRestoring,
            variant: "outline",
          }}
          rightButtonProps={{
            label: t`Restore the skill`,
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
