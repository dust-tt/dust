import { BarHeader } from "@dust-tt/sparkle";
import React from "react";

import { classNames } from "@app/lib/utils";

export function AppLayoutSimpleCloseTitle({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-row items-center">
      <div className="flex flex-initial font-bold">
        <div
          className={classNames(
            "w-48 overflow-hidden truncate pl-10 sm:w-96 sm:pl-0 lg:w-auto lg:px-0"
          )}
        >
          <span>{title}</span>
        </div>
      </div>
      <div className="flex flex-1"></div>
      <BarHeader.ButtonBar variant="close" onClose={onClose} />
    </div>
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
