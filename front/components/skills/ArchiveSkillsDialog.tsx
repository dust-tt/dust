import { useBatchArchiveSkills } from "@app/lib/swr/skill_configurations";
import type { SkillListItemType } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

export type ArchivableSkill = Pick<SkillListItemType, "sId"> & {
  usage?: number | null;
};

interface ArchiveSkillsDialogProps {
  skills: ArchivableSkill[];
  disabled: boolean;
  owner: LightWorkspaceType;
  onSave: () => void;
}

export function ArchiveSkillsDialog({
  skills,
  disabled,
  owner,
  onSave,
}: ArchiveSkillsDialogProps) {
  const { t } = useLingui();
  const [isArchiving, setIsArchiving] = useState(false);
  const doArchive = useBatchArchiveSkills({
    owner,
    skillIds: skills.map((skill) => skill.sId),
  });
  const totalUsage = skills.reduce(
    (total, skill) => total + (skill.usage ?? 0),
    0
  );
  const skillCount = skills.length;
  const isSingleSkill = skillCount === 1;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="warning"
          label={t`Archive`}
          disabled={disabled}
        />
      </DialogTrigger>
      <DialogContent size="md" isAlertDialog>
        <DialogHeader hideButton>
          <DialogTitle>
            <Plural
              value={skillCount}
              one="Archiving # skill"
              other="Archiving # skills"
            />
          </DialogTitle>
          <DialogDescription>
            <div>
              {totalUsage > 0 && (
                <>
                  <span className="font-bold">
                    {isSingleSkill ? (
                      <Plural
                        value={totalUsage}
                        one="This skill has been used # time."
                        other="This skill has been used # times."
                      />
                    ) : (
                      <Plural
                        value={totalUsage}
                        one="These skills have been used # time."
                        other="These skills have been used # times."
                      />
                    )}
                  </span>{" "}
                </>
              )}
              <Plural
                value={skillCount}
                one="This will archive this skill for everyone."
                other="This will archive these skills for everyone."
              />
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
            disabled: isArchiving,
            variant: "outline",
          }}
          rightButtonProps={{
            label: t`${plural(skillCount, {
              one: "Archive the skill",
              other: "Archive the skills",
            })}`,
            variant: "warning",
            disabled: isArchiving,
            isLoading: isArchiving,
            onClick: async (e: React.MouseEvent) => {
              e.preventDefault();
              setIsArchiving(true);
              const success = await doArchive();
              setIsArchiving(false);
              if (success) {
                onSave();
              }
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
