import React, { useEffect, useState } from "react";

import { IconButton } from "@sparkle/components/IconButton";
import { XMarkIcon } from "@sparkle/icons/solid";
import { classNames } from "@sparkle/lib/utils";

interface BannerProps {
  variant?: "info" | "incident" | "error";
  allowDismiss?: boolean;
  className?: string;
  hidden?: boolean;
  onDismiss?: () => void;
  children?: React.ReactNode;
}

const variantClasses = {
  info: "s-bg-indigo-300 s-text-indigo-950",
  incident: "s-bg-amber-300 s-text-amber-950",
  error: "s-bg-red-300 s-text-red-950",
};

export function Banner({
  variant = "info",
  allowDismiss = true,
  className = "",
  hidden = false,
  onDismiss,
  children,
}: BannerProps) {
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    setIsDismissed(hidden);
  }, [hidden]);

  return isDismissed ? (
    <></>
  ) : (
    <div
      className={classNames(
        variantClasses[variant],
        "sm:s-before:flex-1 s-flex s-min-h-16 s-items-center s-px-6 s-py-4 s-text-sm sm:s-px-3.5",
        className
      )}
    >
      {children}
      {allowDismiss && (
        <div className="s-flex s-flex-1 s-items-center s-justify-end">
          <span className="s-sr-only">Dismiss</span>
          <IconButton
            icon={XMarkIcon}
            size="sm"
            variant="secondary"
            onClick={() => {
              setIsDismissed(true);
              if (onDismiss) {
                onDismiss();
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
