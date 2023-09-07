import { Button, XMarkIcon } from "@dust-tt/sparkle";
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
      <Button
        label="Close"
        labelVisible={false}
        tooltipPosition="below"
        variant="tertiary"
        onClick={onClose}
        icon={XMarkIcon}
      />
    </div>
  );
}
