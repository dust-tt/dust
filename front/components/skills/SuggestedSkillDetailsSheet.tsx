import {
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import { SkillHeaderSection } from "@app/components/skills/SkillDetailsSheet";
import { SkillInfoTab } from "@app/components/skills/SkillInfoTab";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";

type SuggestedSkillDetailsSheetProps = {
  skill: SkillWithRelationsType;
  onClose: () => void;
};

export function SuggestedSkillDetailsSheet({
  skill,
  onClose,
}: SuggestedSkillDetailsSheetProps) {
  const suggestedDate =
    skill.createdAt &&
    new Date(skill.createdAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

  const agents = skill.relations.usage?.agents ?? [];

  return (
    <Sheet
      open={!!skill}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent size="lg">
        <VisuallyHidden>
          <SheetTitle />
        </VisuallyHidden>
        <SheetHeader className="flex flex-col gap-5 text-sm text-foreground dark:text-foreground-night">
          <SkillHeaderSection
            skill={skill}
            subtitle={
              suggestedDate ? `Suggested on: ${suggestedDate}` : undefined
            }
          />
        </SheetHeader>
        <SheetContainer className="pb-4">
          <SkillInfoTab skill={skill} />

          {agents.length > 0 && (
            <>
              <Page.Separator />
              <div className="flex flex-col gap-3">
                <div className="heading-lg text-foreground dark:text-foreground-night">
                  Agents which may use this skill
                </div>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  The prompt of these agents may be simplified by using this
                  skill.
                </p>
                <div className="flex flex-col gap-2">
                  {agents.map((agent) => (
                    <div
                      key={agent.sId}
                      className="text-sm text-foreground dark:text-foreground-night"
                    >
                      {agent.name}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
