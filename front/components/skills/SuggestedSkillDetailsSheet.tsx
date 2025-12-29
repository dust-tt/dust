import {
  Button,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useState } from "react";

import { AcceptSuggestionDialog } from "@app/components/skills/AcceptSuggestionDialog";
import { SkillHeaderSection } from "@app/components/skills/SkillDetailsSheet";
import { SkillInfoTab } from "@app/components/skills/SkillInfoTab";
import { useDeclineSuggestion } from "@app/lib/swr/skill_configurations";
import type { LightWorkspaceType } from "@app/types";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";

type SuggestedSkillDetailsSheetProps = {
  skill: SkillWithRelationsType;
  onClose: () => void;
  owner: LightWorkspaceType;
};

export function SuggestedSkillDetailsSheet({
  skill,
  onClose,
  owner,
}: SuggestedSkillDetailsSheetProps) {
  const [isAcceptDialogOpen, setIsAcceptDialogOpen] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const doDecline = useDeclineSuggestion({ owner, skill });

  const suggestedDate =
    skill.createdAt &&
    new Date(skill.createdAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

  const agents = skill.relations.usage?.agents ?? [];

  const handleDecline = async () => {
    setIsDeclining(true);
    const success = await doDecline();
    setIsDeclining(false);
    if (success) {
      onClose();
    }
  };

  return (
    <>
      <AcceptSuggestionDialog
        skill={skill}
        isOpen={isAcceptDialogOpen}
        onClose={() => {
          setIsAcceptDialogOpen(false);
          onClose();
        }}
        owner={owner}
      />
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
          <div className="flex flex-none flex-row gap-2 border-t border-border px-3 py-3 dark:border-border-dark">
            <Button
              variant="outline"
              label="Decline"
              disabled={isDeclining}
              onClick={handleDecline}
            />
            <div className="flex-grow" />
            <Button
              variant="primary"
              label="Accept"
              disabled={isDeclining}
              onClick={() => setIsAcceptDialogOpen(true)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
