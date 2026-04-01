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

export function SkillBuilderIsDefaultSection() {
  const { watch, setValue } = useFormContext<SkillBuilderFormData>();
  const isDefault = watch("isDefault");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

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
        <DialogContent size="md" isAlertDialog>
          <DialogHeader hideButton>
            <DialogTitle>Allow agents to discover this skill?</DialogTitle>
            <DialogDescription className="pt-4">
              This skill will be set as default. Agents with&nbsp;
              <span className="font-semibold">Discover Skills</span>&nbsp; will
              be able to find and enable it on their own.
              <ul className="mt-3 list-disc space-y-1 pl-5">
                <li>
                  This will expose the skill to your entire workspace
                  through the Discover Skills skill.
                </li>
                <li>
                  Experimental or in-progress skills should not be made
                  discoverable.
                </li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
            }}
            rightButtonProps={{
              label: "Confirm",
              variant: "warning",
              onClick: handleConfirm,
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
