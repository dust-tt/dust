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
  description?: string;
  title?: string;
  variant: "success" | "error";
  onClick?: () => void;
}

export function Notification({
  description,
  title,
  variant,
  onClick,
  className = "",
}: NotificationProps) {
  return (
    <div
      className={classNames(
        "s-pointer-events-auto s-flex s-max-w-[260px] s-flex-row s-items-center s-gap-2 s-rounded-xl s-border s-border-structure-100 s-bg-structure-0 s-p-4 s-shadow-xl",
        className
      )}
    >
      {variant === "success" ? (
        <Icon
          size="lg"
          visual={CheckCircleIcon}
          className="s-pt-0.5 s-text-success-500"
        />
      ) : (
        <Icon
          size="lg"
          visual={XCircleIcon}
          className="s-pt-0.5 s-text-warning-500"
        />
      )}

      <div className="s-flex s-flex-col">
        <div className="s-flex s-grow s-flex-row s-gap-6">
          <div
            className={classNames(
              "s-text-md s-grow  s-font-semibold",
              variant === "success"
                ? "s-text-success-500"
                : "s-text-warning-500"
            )}
          >
            {title || variant}
          </div>
          <IconButton
            icon={XMarkIcon}
            size="sm"
            variant="tertiary"
            onClick={onClick}
          />
        </div>
        {description && (
          <div className="s-pr-2 s-text-sm s-font-normal s-text-element-700">
            {description}
          </div>
        )}
      </div>
    </div>
  );
}
