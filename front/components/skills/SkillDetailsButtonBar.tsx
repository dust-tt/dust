import { ArchiveSkillDialog } from "@app/components/skills/ArchiveSkillDialog";
import { SkillFavoriteButton } from "@app/components/skills/SkillFavoriteButton";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import type { GetSkillsWithRelationsResponseBody } from "@app/types/api/skills";
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
  skill: GetSkillsWithRelationsResponseBody["skills"][number];
  owner: WorkspaceType;
  onClose: () => void;
  replaceOnEdit?: boolean;
  onFavoriteChange?: (
    skill: GetSkillsWithRelationsResponseBody["skills"][number],
    isFavorite: boolean
  ) => Promise<void>;
}

export function SkillDetailsButtonBar({
  skill,
  owner,
  onClose,
  replaceOnEdit,
  onFavoriteChange,
}: SkillDetailsButtonBarProps) {
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);

  if (!skill.canAdministrate && !onFavoriteChange) {
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
        {onFavoriteChange && (
          <SkillFavoriteButton
            isFavorite={skill.isFavorite ?? false}
            variant="outline"
            onFavoriteChange={(isFavorite) =>
              onFavoriteChange(skill, isFavorite)
            }
          />
        )}
        {skill.canAdministrate && (
          <Button
            size="sm"
            tooltip="Edit skill"
            href={getSkillBuilderRoute(owner.sId, skill.sId)}
            replace={replaceOnEdit}
            variant="outline"
            icon={Edit04}
          />
        )}
        {skill.canAdministrate && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                icon={DotsHorizontal}
                size="sm"
                variant="ghost"
                tooltip="Skill options"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                label="Archive"
                icon={Trash01}
                variant="warning"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowArchiveDialog(true);
                }}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </>
  );
}
