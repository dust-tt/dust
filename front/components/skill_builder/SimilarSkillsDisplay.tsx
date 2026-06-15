import { LinkWrapper } from "@app/lib/platform";
import { getSkillAvatarIcon } from "@app/lib/skill";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";
import { Icon, LinkExternal01, Spinner } from "@dust-tt/sparkle";

interface SimilarSkillsDisplayProps {
  owner: LightWorkspaceType;
  similarSkills: SkillWithoutInstructionsAndToolsType[];
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
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner size="xs" />
        <span>Checking for similar skills...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="heading-sm text-foreground">Similar skills found</span>
        {isLoading && <Spinner size="xs" />}
      </div>
      <div className="space-y-3">
        {similarSkills.map((skill) => {
          const SkillAvatar = getSkillAvatarIcon(skill);

          return (
            <div key={skill.sId} className="flex items-start gap-3">
              <SkillAvatar name={skill.name} size="sm" />
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium text-foreground">
                    {skill.name}
                  </span>
                  <LinkWrapper
                    href={`/w/${owner.sId}/builder/skills#?skillId=${skill.sId}`}
                    target="_blank"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Icon visual={LinkExternal01} size="xs" />
                  </LinkWrapper>
                </div>
                <span className="line-clamp-1 text-xs text-muted-foreground">
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
