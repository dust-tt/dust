import React from "react";

import {
  CheckCircleIcon,
  IconButton,
  XCircleIcon,
  XMarkIcon,
} from "@sparkle/index";
import { classNames } from "@sparkle/lib/utils";

import { Icon } from "./Icon";

export interface NotificationProps {
  className?: string;
  description: string;
  title: string;
  type: "success" | "error";
  onClick?: () => void;
}

export function Notification({
  description,
  title,
  type,
  onClick,
  className = "",
}: NotificationProps) {
  return (
    <div
      className={classNames(
        "s-pointer-events-auto s-relative s-flex s-max-w-[260px] s-items-start s-gap-2 s-rounded-xl s-border s-border-structure-100 s-bg-structure-0 s-pb-5 s-pl-4 s-pr-8 s-pt-4 s-shadow-xl",
        className
      )}
    >
      {type === "success" ? (
        <Icon
          size="md"
          visual={CheckCircleIcon}
          className="s-pt-0.5 s-text-success-500"
        />
      ) : (
        <Icon
          size="md"
          visual={XCircleIcon}
          className="s-pt-0.5 s-text-warning-500"
        />
      )}
      <div className="s-flex s-flex-col s-gap-1">
        <div
          className={classNames(
            "s-text-md s-font-semibold",
            type === "success" ? "s-text-success-500" : "s-text-warning-500"
          )}
        >
          {title || type}
        </div>
        <div className="s-text-sm s-font-normal s-text-element-700">
          {description}
        </div>
      </div>
      <div className="s-absolute s-right-2 s-top-2">
        <IconButton
          className="s-pt-0.5"
          icon={XMarkIcon}
          size="sm"
          variant="secondary"
          onClick={onClick}
        />
      </div>
    </div>
  );
}
