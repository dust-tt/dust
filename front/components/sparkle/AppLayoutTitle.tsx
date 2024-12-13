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
  saveDisabled,
  saveTooltip,
}: {
  title: string;
  onSave?: () => void;
  onCancel: () => void;
  isSaving?: boolean;
  saveDisabled?: boolean;
  saveTooltip?: string;
}) {
  return (
    <BarHeader
      title={title}
      rightActions={
        <BarHeader.ButtonBar
          variant="validate"
          onCancel={onCancel}
          onSave={onSave}
          isSaving={isSaving}
          saveDisabled={saveDisabled}
          saveTooltip={saveTooltip}
        />
      }
      className="ml-10 lg:ml-0"
    />
  );
}
