import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import {
  Button,
  ContentMessage,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

export function SkillBuilderIsDefaultSection() {
  const { watch, setValue } = useFormContext<SkillBuilderFormData>();
  const isDefault = watch("isDefault");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const openDialog = () => {
    setShowConfirmDialog(true);
  };

  const handleButtonClick = () => {
    if (isDefault) {
      setValue("isDefault", false, { shouldDirty: true });
      return;
    }

    openDialog();
  };

  const handleConfirm = () => {
    setValue("isDefault", true, { shouldDirty: true });
    setShowConfirmDialog(false);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          label={!isDefault ? "Allow agents to discover this skill" : "Prevent agents from discovering this skill"}
          onClick={handleButtonClick}
          tooltip="This skill will be set as default. Agents with Discover Skills will be able to find and enable it on their own"
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
                  This will expose the skill to your entire workspace through
                  the Discover Skills skill.
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
