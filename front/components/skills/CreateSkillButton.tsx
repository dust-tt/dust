import { SKILL_ICON } from "@app/lib/skill";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FolderOpen,
  Plus,
} from "@dust-tt/sparkle";

interface CreateSkillButtonProps {
  owner: LightWorkspaceType;
  onImport: () => void;
}

export function CreateSkillButton({ owner, onImport }: CreateSkillButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button label="Create skill" icon={Plus} isSelect />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          label="From scratch"
          icon={SKILL_ICON}
          href={getSkillBuilderRoute(owner.sId, "new")}
        />
        <DropdownMenuItem
          label="From existing"
          icon={FolderOpen}
          onClick={onImport}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
