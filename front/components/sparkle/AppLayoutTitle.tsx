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
    />
  );
}

export function AppLayoutSimpleSaveCancelTitle({
  title,
  onSave,
  onCancel,
}: {
  title: string;
  onSave?: () => void;
  onCancel: () => void;
}) {
  return (
    <BarHeader
      title={title}
      rightActions={
        <BarHeader.ButtonBar
          variant="validate"
          onCancel={onCancel}
          onSave={onSave}
        />
      }
    />
  );
}
