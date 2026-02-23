import { LinkWrapper } from "@app/lib/platform";
import { getSkillAvatarIcon } from "@app/lib/skill";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";
import { ExternalLinkIcon, Icon, Spinner } from "@dust-tt/sparkle";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React from "react";

interface SimilarSkillsDisplayProps {
  owner: LightWorkspaceType;
  similarSkills: SkillType[];
  isLoading: boolean;
}

export function SimilarSkillsDisplay({
  owner,
  similarSkills,
  isLoading,
}: SimilarSkillsDisplayProps) {
  if (similarSkills.length === 0 && !isLoading) {
    return null;
  }

  if (similarSkills.length === 0 && isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
        <Spinner size="xs" />
        <span>Checking for similar skills...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="heading-sm text-foreground dark:text-foreground-night">
          Similar skills found
        </span>
        {isLoading && <Spinner size="xs" />}
      </div>
      <div className="space-y-3">
        {similarSkills.map((skill) => {
          const SkillAvatar = getSkillAvatarIcon(skill.icon);

          return (
            <div key={skill.sId} className="flex items-start gap-3">
              <SkillAvatar name={skill.name} size="sm" />
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                    {skill.name}
                  </span>
                  <LinkWrapper
                    href={`/w/${owner.sId}/builder/skills#?skillId=${skill.sId}`}
                    target="_blank"
                    className="text-muted-foreground hover:text-foreground dark:text-muted-foreground-night dark:hover:text-foreground-night"
                  >
                    <Icon visual={ExternalLinkIcon} size="xs" />
                  </LinkWrapper>
                </div>
                <span className="line-clamp-1 text-xs text-muted-foreground dark:text-muted-foreground-night">
                  {skill.agentFacingDescription}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
