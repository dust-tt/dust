import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import {
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InformationCircleIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

const MIN_DISCOVERABLE_DESCRIPTION_LENGTH = 150;

export function SkillBuilderIsDefaultSection() {
  const { watch, setValue } = useFormContext<SkillBuilderFormData>();
  const isDefault = watch("isDefault");
  const agentFacingDescription = watch("agentFacingDescription");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const isDescriptionTooShort =
    agentFacingDescription.trim().length < MIN_DISCOVERABLE_DESCRIPTION_LENGTH;

  const handleCheckboxChange = (checked: boolean) => {
    if (checked) {
      setShowConfirmDialog(true);
    } else {
      setValue("isDefault", false, { shouldDirty: true });
    }
  };

  const handleConfirm = () => {
    setValue("isDefault", true, { shouldDirty: true });
    setShowConfirmDialog(false);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={isDefault}
          onCheckedChange={handleCheckboxChange}
          size="sm"
        />
        <span className="text-sm text-foreground dark:text-foreground-night">
          Allow agents to discover this skill
        </span>
        <Tooltip
          label="This skill will be set as default. Agents with Discover Skills will be able to find and enable it on their own"
          trigger={
            <InformationCircleIcon className="text-muted-foreground dark:text-muted-foreground-night h-4 w-4" />
          }
        />
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
            <DialogTitle>Allow agents to discover this skill?</DialogTitle>
            <div className="space-y-4 pt-4">
              <DialogDescription>
                This skill will be set as default. Agents with&nbsp;
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
                  allowing discovery.
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
