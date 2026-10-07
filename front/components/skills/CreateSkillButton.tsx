import { SKILL_ICON } from "@app/lib/skill";
import { getCreateFromConversationRoute } from "@app/lib/skills/conversational_building";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FolderOpen,
  MessageChatCircle,
  Plus,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface CreateSkillButtonProps {
  owner: LightWorkspaceType;
  onImport: () => void;
}

export function CreateSkillButton({ owner, onImport }: CreateSkillButtonProps) {
  const { t } = useLingui();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label={t`Create skill`}
          icon={Plus}
          isSelect
          onClick={withTracking(TRACKING_AREAS.BUILDER, "create_skill_menu")}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          label={t`From conversation`}
          icon={MessageChatCircle}
          href={getCreateFromConversationRoute(owner.sId, "skill")}
          onClick={withTracking(
            TRACKING_AREAS.BUILDER,
            "create_skill_from_conversation"
          )}
        />
        <DropdownMenuItem
          label={t`From scratch`}
          icon={SKILL_ICON}
          href={getSkillBuilderRoute(owner.sId, "new")}
          onClick={withTracking(TRACKING_AREAS.BUILDER, "create_skill")}
        />
        <DropdownMenuItem
          label={t`From existing`}
          icon={FolderOpen}
          onClick={withTracking(
            TRACKING_AREAS.BUILDER,
            "import_skill",
            onImport
          )}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
