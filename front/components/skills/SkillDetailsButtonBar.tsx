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
  return (
    <div className="flex flex-row items-center gap-2 px-1.5">
      <Button
        size="sm"
        tooltip="Edit agent"
        href={getSkillBuilderRoute(owner.sId, skill.sId)}
        variant="outline"
        icon={PencilSquareIcon}
      />
      <SkillDetailsDropdownMenu skill={skill} owner={owner} />
    </div>
  );
}

interface SkillDetailsDropdownMenuProps {
  skill: SkillType;
  owner: WorkspaceType;
}

export function SkillDetailsDropdownMenu({
  skill,
  owner,
}: SkillDetailsDropdownMenuProps) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button icon={MoreIcon} size="sm" variant="ghost" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          label="Copy skill ID"
          onClick={async (e) => {
            e.stopPropagation();
            await navigator.clipboard.writeText(skill.sId);
          }}
          icon={BracesIcon}
        />
        <DropdownMenuItem
          label="Clone (New)"
          icon={ClipboardIcon}
          onClick={async (e) => {
            e.stopPropagation();
            await router.push(
              getSkillBuilderRoute(owner.sId, "new", `duplicate=${skill.sId}`)
            );
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
