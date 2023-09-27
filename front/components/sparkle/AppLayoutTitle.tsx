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
}: {
  title: string;
  onSave?: () => void;
  onCancel: () => void;
  isSaving?: boolean;
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
        />
      }
      className="ml-10 lg:ml-0"
    />
  );
}
