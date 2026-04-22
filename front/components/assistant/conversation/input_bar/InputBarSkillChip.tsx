import { getSkillIcon } from "@app/lib/skill";
import { getManageSkillsRoute } from "@app/lib/utils/router";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { WorkspaceType } from "@app/types/user";
import { isBuilder } from "@app/types/user";
import { Chip } from "@dust-tt/sparkle";

interface InputBarSkillChipProps {
  className?: string;
  compact?: boolean;
  owner: WorkspaceType;
  skill: SkillWithoutInstructionsAndToolsType;
  onRemove?: () => void;
}

export function InputBarSkillChip({
  className,
  compact = false,
  owner,
  skill,
  onRemove,
}: InputBarSkillChipProps) {
  const href = isBuilder(owner)
    ? getManageSkillsRoute(owner.sId, skill.sId)
    : undefined;

  if (compact) {
    return (
      <Chip
        icon={getSkillIcon(skill.icon)}
        href={href}
        target={href ? "_blank" : undefined}
        color="white"
        onRemove={onRemove}
        size="xs"
        className={className}
      />
    );
  }

  return (
    <Chip
      label={skill.name}
      icon={getSkillIcon(skill.icon)}
      href={href}
      target={href ? "_blank" : undefined}
      color="white"
      onRemove={onRemove}
      size="xs"
      className={className}
    />
  );
}
