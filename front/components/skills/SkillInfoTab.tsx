import { Page, ReadOnlyTextArea } from "@dust-tt/sparkle";

import { timeAgoFrom } from "@app/lib/utils";
import type { SkillConfigurationType } from "@app/types/assistant/skill_configuration";

export function SkillInfoTab({
  skillConfiguration,
}: {
  skillConfiguration: SkillConfigurationType;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-foreground dark:text-foreground-night">
        {skillConfiguration.description}
      </div>
      <SkillEdited skillConfiguration={skillConfiguration} />

      <Page.Separator />

      {skillConfiguration.instructions && (
        <div className="dd-privacy-mask flex flex-col gap-5">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Instructions
          </div>
          <ReadOnlyTextArea content={skillConfiguration.instructions} />
        </div>
      )}
    </div>
  );
}

interface SkillEditedProps {
  skillConfiguration: SkillConfigurationType;
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
