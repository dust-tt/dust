import { useBatchArchiveSkills } from "@app/lib/swr/skill_configurations";
import type { GetSkillsWithRelationsResponseBody } from "@app/types/api/skills";
import { pluralize } from "@app/types/shared/utils/string_utils";
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
import { useState } from "react";

interface ArchiveSkillsDialogProps {
  skills: GetSkillsWithRelationsResponseBody["skills"];
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
  const [isArchiving, setIsArchiving] = useState(false);
  const doArchive = useBatchArchiveSkills({
    owner,
    skillIds: skills.map((skill) => skill.sId),
  });
  const totalUsage = skills.reduce(
    (total, skill) => total + (skill.messageCount ?? 0),
    0
  );
  const isSingleSkill = skills.length === 1;
  const skillLabel = `skill${pluralize(skills.length)}`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="warning"
          label="Archive"
          disabled={disabled}
        />
      </DialogTrigger>
      <DialogContent size="md" isAlertDialog>
        <DialogHeader hideButton>
          <DialogTitle>
            Archiving {skills.length} {skillLabel}
          </DialogTitle>
          <DialogDescription>
            <div>
              {totalUsage > 0 && (
                <>
                  <span className="font-bold">
                    {isSingleSkill ? "This skill has" : "These skills have"}
                    {" been used "}
                    {totalUsage} time
                    {pluralize(totalUsage)}.
                  </span>{" "}
                </>
              )}
              This will archive {isSingleSkill ? "this skill" : "these skills"}
              {" for everyone."}
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
            label: `Archive the ${skillLabel}`,
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
