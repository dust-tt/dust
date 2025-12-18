import {
  Avatar,
  ContentMessage,
  InformationCircleIcon,
  Spinner,
} from "@dust-tt/sparkle";

import { getSkillIcon } from "@app/lib/skill";
import type { SkillType } from "@app/types/assistant/skill_configuration";

type SimilarSkillsDisplayProps = {
  similarSkills: SkillType[];
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
              icon={getSkillIcon(skill.icon)}
              size="xs"
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                {skill.name}
              </span>
              <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                {skill.agentFacingDescription}
              </span>
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
