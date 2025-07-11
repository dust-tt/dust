import { BarHeader } from "@dust-tt/sparkle";
import React from "react";

export function AppLayoutSimpleCloseTitle({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <BarHeader
      title={title}
      rightActions={<BarHeader.ButtonBar variant="close" onClose={onClose} />}
      className="ml-10 lg:ml-0"
    />
  );
}

export function AppLayoutSimpleSaveCancelTitle({
  title,
  onSave,
  onCancel,
  isSaving,
  saveTooltip,
}: {
  title: string;
  onSave?: () => void;
  onCancel: () => void;
  isSaving?: boolean;
  saveTooltip?: string;
}) {
  return (
    <BarHeader
      title={title}
      rightActions={
        <BarHeader.ButtonBar
          variant="validate"
          cancelButtonProps={{
            size: "sm",
            label: "Cancel",
            variant: "ghost",
            onClick: onCancel,
          }}
          saveButtonProps={
            onSave
              ? {
                  size: "sm",
                  label: isSaving ? "Saving..." : "Save",
                  variant: "primary",
                  onClick: onSave,
                  disabled: isSaving,
                  tooltip: saveTooltip,
                }
              : undefined
          }
        />
      }
      className="ml-10 lg:ml-0"
    />
  );
}
