import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { Button, cn, XMarkIcon } from "@dust-tt/sparkle";
import type React from "react";

interface AgentActionsPanelHeaderProps {
  children?: React.ReactNode;
  onClose?: () => void;
  title: string;
}

export function AgentActionsPanelHeader({
  children,
  onClose,
  title,
}: AgentActionsPanelHeaderProps) {
  return (
    <AppLayoutTitle className="@container">
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
        </div>

        {/* Actions - always visible and right-aligned. */}
        <div className="flex shrink-0 items-center gap-2">
          {children}
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
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
