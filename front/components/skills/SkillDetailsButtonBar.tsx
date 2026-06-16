import { ArchiveSkillDialog } from "@app/components/skills/ArchiveSkillDialog";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import type { SkillWithoutInstructionsAndToolsWithRelationsType } from "@app/types/assistant/skill_configuration";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Edit04,
  Trash01,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface SkillDetailsButtonBarProps {
  skill: SkillWithoutInstructionsAndToolsWithRelationsType;
  owner: WorkspaceType;
  onClose: () => void;
}

export function SkillDetailsButtonBar({
  skill,
  owner,
  onClose,
}: SkillDetailsButtonBarProps) {
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);

  if (!skill.canWrite) {
    return null;
  }

  return (
    <>
      <ArchiveSkillDialog
        owner={owner}
        isOpen={showArchiveDialog}
        skill={skill}
        onClose={() => {
          setShowArchiveDialog(false);
          onClose();
        }}
      />
      <div className="flex flex-row items-center gap-2 px-1.5">
        {skill.canWrite && (
          <Button
            size="sm"
            tooltip="Edit skill"
            href={getSkillBuilderRoute(owner.sId, skill.sId)}
            variant="outline"
            icon={Edit04}
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button icon={DotsHorizontal} size="sm" variant="ghost" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {skill.canWrite && (
              <DropdownMenuItem
                label="Archive"
                icon={Trash01}
                variant="warning"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowArchiveDialog(true);
                }}
              />
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
