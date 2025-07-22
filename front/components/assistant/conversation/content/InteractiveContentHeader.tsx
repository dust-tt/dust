import { Button, cn, XMarkIcon } from "@dust-tt/sparkle";
import React from "react";

interface InteractiveContentHeaderProps {
  children?: React.ReactNode;
  onClose: () => void;
  subtitle?: string;
  title: string;
}

export function InteractiveContentHeader({
  children,
  onClose,
  subtitle,
  title,
}: InteractiveContentHeaderProps) {
  return (
    <div
      className={cn(
        "bg-structure-0/60 flex border-border/70 backdrop-blur-sm dark:border-border-night/70",
        "items-center justify-between border-b px-4 py-2 @container"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <span className="min-w-0 truncate text-sm font-medium text-primary dark:text-primary-night @xxs:inline hidden">
          {title}
        </span>
        {subtitle && (
          <span className="text-element-700 hidden shrink-0 text-xs @xs:inline">
            {subtitle}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {children}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          icon={XMarkIcon}
          className="text-element-600 hover:text-element-900"
        />
      </div>
    </div>
  );
}
