import {
  BracesIcon,
  Button,
  ClipboardIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  MoreIcon,
  PencilSquareIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";

import { getSkillBuilderRoute } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

interface SkillDetailsButtonBarProps {
  skill: SkillType;
  owner: WorkspaceType;
}

export function SkillDetailsButtonBar({
  skill,
  owner,
}: SkillDetailsButtonBarProps) {
  const router = useRouter();

  if (!skill.canWrite && !skill.isExtendable) {
    return null;
  }

  return (
    <>
      <ArchiveSkillDialog
        owner={owner}
        isOpen={showArchiveDialog}
        skillConfiguration={skill}
        onClose={() => {
          setShowArchiveDialog(false);
          onClose();
        }}
      />
      <div className="flex flex-row items-center gap-2 px-1.5">
        {skill.canWrite && (
          <Button
            size="sm"
            tooltip="Edit agent"
            href={getSkillBuilderRoute(owner.sId, skill.sId)}
            variant="outline"
            icon={PencilSquareIcon}
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button icon={MoreIcon} size="sm" variant="ghost" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {skill.isExtendable && (
              <DropdownMenuItem
                label="Extend (New)"
                icon={ClipboardIcon}
                onClick={async (e) => {
                  e.stopPropagation();
                  await router.push(
                    getSkillBuilderRoute(
                      owner.sId,
                      "new",
                      `extends=${skill.sId}`
                    )
                  );
                }}
              />
            )}
            {skill.canWrite && (
              <DropdownMenuItem
                label="Archive"
                icon={TrashIcon}
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
