import { Button, cn, XMarkIcon } from "@dust-tt/sparkle";
import React from "react";

import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";

interface InteractiveContentHeaderProps {
  children?: React.ReactNode;
  onClose?: () => void;
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
    <AppLayoutTitle className="bg-gray-50 @container dark:bg-gray-900">
      <div className="flex h-full min-w-0 max-w-full items-center justify-between gap-2">
        {/* Progressive content visibility based on container width. */}
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          {/* Title - visible from xxxs container width. */}
          <span
            className={cn(
              "hidden min-w-0 truncate text-sm font-normal @xxxs:inline",
              "text-primary dark:text-primary-night"
            )}
          >
            {title}
          </span>
          {/* Subtitle - visible from xs container width. */}
          {subtitle && (
            <span className="text-element-700 hidden shrink-0 text-xs @xs:inline">
              {subtitle}
            </span>
          )}
        </div>

        {/* Actions - always visible and right-aligned. */}
        <div className="flex shrink-0 items-center gap-2">
          {children}
          {onClose && (
            <Button
              variant="ghost"
              size="xs"
              onClick={onClose}
              icon={XMarkIcon}
              className="text-element-600 hover:text-element-900"
            />
          )}
        </div>
      </div>
    </AppLayoutTitle>
  );
}
