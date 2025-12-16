import { Page, ReadOnlyTextArea } from "@dust-tt/sparkle";

import { timeAgoFrom } from "@app/lib/utils";
import type { SkillType } from "@app/types/assistant/skill_configuration";

export function SkillInfoTab({ skill }: { skill: SkillType }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-foreground dark:text-foreground-night">
        {skill.userFacingDescription}
      </div>
      {/* TODO(skills 2025-12-12): display agent facing description here */}
      {skill.updatedAt && (
        <SkillEdited
          skillConfiguration={{
            ...skill,
            updatedAt: skill.updatedAt,
          }}
        />
      )}

      <Page.Separator />

      {skill.instructions && (
        <div className="dd-privacy-mask flex flex-col gap-5">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Instructions
          </div>
          <ReadOnlyTextArea content={skill.instructions} />
        </div>
      )}
    </div>
  );
}

interface SkillEditedProps {
  skillConfiguration: SkillType & { updatedAt: number };
}

export function SkillEdited({ skillConfiguration }: SkillEditedProps) {
  const editedSentence = timeAgoFrom(skillConfiguration.updatedAt);

  return (
    <div className="flex gap-2 text-xs text-muted-foreground dark:text-muted-foreground-night sm:grid-cols-2">
      <b>Last edited: </b>
      <div>{editedSentence}</div>
    </div>
  );
}
