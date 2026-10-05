import { SKILL_ICON } from "@app/lib/skill";
import {
  trackManageCreate,
  useManageTracking,
} from "@app/lib/tracking/manageTracking";
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
  const tracking = useManageTracking();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label="Create skill"
          icon={Plus}
          isSelect
          onClick={() => trackManageCreate(tracking, "menu")}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          label="From scratch"
          icon={SKILL_ICON}
          onClick={() => trackManageCreate(tracking, "scratch")}
          href={getSkillBuilderRoute(owner.sId, "new")}
        />
        <DropdownMenuItem
          label="From existing"
          icon={FolderOpen}
          onClick={() => {
            trackManageCreate(tracking, "import");
            onImport();
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
