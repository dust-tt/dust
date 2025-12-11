import {
  Avatar,
  ContentMessage,
  InformationCircleIcon,
  Spinner,
} from "@dust-tt/sparkle";

import { SKILL_ICON } from "@app/lib/skill";
import type { SkillConfigurationType } from "@app/types/assistant/skill_configuration";

type SimilarSkillsDisplayProps = {
  similarSkills: SkillConfigurationType[];
  isLoading: boolean;
};

export function SimilarSkillsDisplay({
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
    <ContentMessage
      variant="outline"
      size="md"
      title="Similar skills found"
      icon={InformationCircleIcon}
    >
      <div className="mt-2 space-y-3">
        {similarSkills.map((skill) => (
          <div key={skill.sId} className="flex items-start gap-2">
            <Avatar
              name={skill.name}
              visual={<SKILL_ICON className="text-element-700" />}
              size="xs"
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                {skill.name}
              </span>
              {skill.description && (
                <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                  {skill.description}
                </span>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
            <Spinner size="xs" />
            <span>Checking for similar skills...</span>
          </div>
        )}
      </div>
    </ContentMessage>
  );
}
