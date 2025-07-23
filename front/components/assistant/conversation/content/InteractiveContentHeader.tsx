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
    <div className="shrink-0 border-b border-border bg-background bg-gray-50 px-4 py-3 dark:border-border-night dark:bg-background-night dark:bg-gray-900 sm:px-8">
      <div className="grid h-full min-w-0 max-w-full grid-cols-[1fr,auto] items-center gap-4">
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span
            className={cn(
              "min-w-0 truncate text-sm font-medium",
              "text-primary dark:text-primary-night"
            )}
          >
            {title}
          </span>
          {subtitle && (
            <span className="text-element-700 shrink-0 text-xs">
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
    </div>
  );
}
