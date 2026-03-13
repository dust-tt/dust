import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import {
  CheckboxWithText,
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
      <div className="flex items-center gap-1.5">
        <CheckboxWithText
          checked={isDefault}
          onCheckedChange={handleCheckboxChange}
          text="Allow agents to discover this skill"
        />
        <Tooltip
          label="Agents with the Discover Skills tool will be able to find and enable this skill on their own."
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
            <DialogDescription>
              Agents with{" "}
              <span className="font-semibold">Discover Skills</span> will be
              able to find and enable this skill on their own.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
            }}
            rightButtonProps={{
              label: "Confirm",
              variant: "highlight",
              onClick: handleConfirm,
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
