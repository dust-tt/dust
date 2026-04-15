import { getSkillIcon } from "@app/lib/skill";
import { getManageSkillsRoute } from "@app/lib/utils/router";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { WorkspaceType } from "@app/types/user";
import { isBuilder } from "@app/types/user";
import { AttachmentChip, Chip } from "@dust-tt/sparkle";

export function InputBarSkillChip({
  className,
  compact = false,
  owner,
  skill,
  onRemove,
}: {
  className?: string;
  compact?: boolean;
  owner: WorkspaceType;
  skill: SkillType;
  onRemove?: () => void;
}) {
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
    <AttachmentChip
      label={skill.name}
      icon={{ visual: getSkillIcon(skill.icon) }}
      href={href}
      target={href ? "_blank" : undefined}
      color="white"
      onRemove={onRemove}
      size="xs"
      className={className}
    />
  );
}
