import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import type { SkillVisibility } from "@app/types/assistant/skill_configuration";
import { isSkillVisibility } from "@app/types/assistant/skill_configuration";
import {
  Button,
  ContentMessage,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  GlobeAltIcon,
  InformationCircleIcon,
  LockIcon,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

const MIN_DISCOVERABLE_DESCRIPTION_LENGTH = 150;

const VISIBILITY_OPTIONS: {
  value: SkillVisibility;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  {
    value: "unpublished",
    label: "Unpublished",
    description: "Only editors can use it from the input bar.",
    icon: LockIcon,
  },
  {
    value: "published",
    label: "Published",
    description: "Available in Agent Builder and the input bar.",
    icon: UserGroupIcon,
  },
  {
    value: "discoverable",
    label: "Discoverable",
    description: "Agents with Discover Skills can find and enable it.",
    icon: GlobeAltIcon,
  },
];

function getVisibilityLabel(visibility: SkillVisibility): string {
  switch (visibility) {
    case "unpublished":
      return "Unpublished";
    case "published":
      return "Published";
    case "discoverable":
      return "Discoverable";
  }
}

export function SkillBuilderVisibilitySection() {
  const { watch, setValue } = useFormContext<SkillBuilderFormData>();
  const visibility = watch("visibility");
  const agentFacingDescription = watch("agentFacingDescription");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const isDescriptionTooShort =
    agentFacingDescription.trim().length < MIN_DISCOVERABLE_DESCRIPTION_LENGTH;

  const setVisibility = (nextVisibility: SkillVisibility) => {
    setValue("visibility", nextVisibility, { shouldDirty: true });
  };

  const handleVisibilityChange = (value: string) => {
    if (!isSkillVisibility(value)) {
      return;
    }

    if (value === "discoverable" && visibility !== "discoverable") {
      setShowConfirmDialog(true);
      return;
    }

    setVisibility(value);
  };

  const handleConfirm = () => {
    setVisibility("discoverable");
    setShowConfirmDialog(false);
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground dark:text-foreground-night">
            Visibility
          </div>
          <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            {VISIBILITY_OPTIONS.find((option) => option.value === visibility)
              ?.description ?? ""}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              label={getVisibilityLabel(visibility)}
              variant="outline"
              isSelect
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuRadioGroup
              value={visibility}
              onValueChange={handleVisibilityChange}
            >
              {VISIBILITY_OPTIONS.map((option) => (
                <DropdownMenuRadioItem
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  description={option.description}
                  icon={option.icon}
                />
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Dialog
        open={showConfirmDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowConfirmDialog(false);
          }
        }}
      >
        <DialogContent size="lg" isAlertDialog>
          <DialogHeader hideButton>
            <DialogTitle>Make this skill discoverable?</DialogTitle>
            <div className="space-y-4 pt-4">
              <DialogDescription>
                Agents with&nbsp;
                <span className="font-semibold">Discover Skills</span>&nbsp;
                will be able to find and enable it on their own.
              </DialogDescription>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground dark:text-muted-foreground-night">
                <li>
                  This will expose the skill to your entire workspace through
                  the Discover Skills skill.
                </li>
                <li>
                  Experimental or in-progress skills should not be made
                  discoverable.
                </li>
              </ul>
              {isDescriptionTooShort && (
                <ContentMessage
                  variant="golden"
                  title="Agents may not understand when to use this skill"
                  icon={InformationCircleIcon}
                  size="lg"
                  className="w-full"
                >
                  The content in&nbsp;
                  <span className="font-semibold">
                    What will this skill be used for
                  </span>
                  &nbsp;may be too short for agents to clearly understand when
                  to use this skill. Consider making it more descriptive before
                  making it discoverable.
                </ContentMessage>
              )}
            </div>
          </DialogHeader>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
            }}
            rightButtonProps={{
              label: "Confirm",
              variant: "warning",
              disabled: isDescriptionTooShort,
              onClick: handleConfirm,
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
