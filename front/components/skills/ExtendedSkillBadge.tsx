import { cn, Icon } from "@dust-tt/sparkle";

import { getSkillIcon } from "@app/lib/skill";
import type { SkillType } from "@app/types/assistant/skill_configuration";

type ExtendedSkillInfo = Pick<SkillType, "name" | "icon">;

interface ExtendedSkillBadgeProps {
  extendedSkill: ExtendedSkillInfo;
  className?: string;
}

export function ExtendedSkillBadge({
  extendedSkill,
  className,
}: ExtendedSkillBadgeProps) {
  return (
    <div className={cn("flex items-center gap-1 font-normal", className)}>
      <p className="text-muted-foreground dark:text-muted-foreground-night">
        Based on
      </p>
      <Icon visual={getSkillIcon(extendedSkill.icon)} size="xs" />
      <p className="text-foreground dark:text-foreground-night">
        {extendedSkill.name}
      </p>
    </div>
  );
}
