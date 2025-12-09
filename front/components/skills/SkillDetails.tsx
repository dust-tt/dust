import {
  Avatar,
  Chip,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import { SKILL_ICON } from "@app/lib/skill";
import type {
  SkillConfigurationWithAuthorType,
  SkillScope,
} from "@app/types/skill_configuration";

export const SCOPE_INFO: Record<
  SkillScope,
  {
    shortLabel: string;
    label: string;
    color: "green" | "primary";
  }
> = {
  workspace: {
    shortLabel: "Published",
    label: "Published",
    color: "green",
  },
  private: {
    shortLabel: "Not published",
    label: "Not published",
    color: "primary",
  },
} as const;

type SkillDetailsProps = {
  skillConfiguration: SkillConfigurationWithAuthorType | null;
  onClose: () => void;
};

export function SkillDetails({
  skillConfiguration,
  onClose,
}: SkillDetailsProps) {
  return (
    <Sheet open={!!skillConfiguration} onOpenChange={onClose}>
      <SheetContent size="lg">
        <VisuallyHidden>
          <SheetTitle />
        </VisuallyHidden>
        <SheetHeader className="flex flex-col gap-5 text-sm text-foreground dark:text-foreground-night">
          {skillConfiguration && (
            <DescriptionSection skillConfiguration={skillConfiguration} />
          )}
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
        {skillConfiguration.status === "active" && (
          <div>
            <Chip color={SCOPE_INFO[skillConfiguration.scope].color}>
              {SCOPE_INFO[skillConfiguration.scope].label}
            </Chip>
          </div>
        )}
      </div>
    </div>
  </div>
);
