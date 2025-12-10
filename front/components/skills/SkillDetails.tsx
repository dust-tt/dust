import {
  Avatar,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import { SKILL_ICON } from "@app/lib/skill";
import type { SkillConfigurationWithAuthorType } from "@app/types/skill_configuration";

type SkillDetailsProps = {
  skillConfiguration: SkillConfigurationWithAuthorType;
  onClose: () => void;
};

export function SkillDetails({
  skillConfiguration,
  onClose,
}: SkillDetailsProps) {
  return (
    <Sheet
      open={!!skillConfiguration}
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
          <DescriptionSection skillConfiguration={skillConfiguration} />
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
}

type DescriptionSectionProps = {
  skillConfiguration: SkillConfigurationWithAuthorType;
};

const DescriptionSection = ({
  skillConfiguration,
}: DescriptionSectionProps) => (
  <div className="flex flex-col gap-5">
    <div className="flex flex-col gap-3 sm:flex-row">
      <Avatar name="Agent avatar" visual={<SKILL_ICON />} size="lg" />
      <div className="flex grow flex-col gap-1">
        <div className="heading-lg line-clamp-1 text-foreground dark:text-foreground-night">
          {skillConfiguration.name}
        </div>
      </div>
    </div>
  </div>
);
