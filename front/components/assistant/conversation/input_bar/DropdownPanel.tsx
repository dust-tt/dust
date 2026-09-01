import {
  Button,
  ChevronLeft,
  cn,
  DropdownMenuSeparator,
  ScrollArea,
} from "@dust-tt/sparkle";
import type React from "react";

export interface DropdownPanelNavigation {
  onBack: () => void;
  onClose: () => void;
}

interface DropdownPanelProps {
  children: React.ReactNode;
  className?: string;
  headers?: React.ReactNode;
  onBack: () => void;
  title: string;
}

export function DropdownPanel({
  children,
  className,
  headers,
  onBack,
  title,
}: DropdownPanelProps) {
  return (
    <div className={cn("flex flex-col p-1", className)}>
      <div className="flex shrink-0 flex-col">
        <div className="flex items-center gap-1.5 px-1 py-1">
          <Button
            variant="ghost-secondary"
            size="xs"
            icon={ChevronLeft}
            isRounded
            tooltip="Back"
            onClick={onBack}
          />
          <span className="heading-sm text-foreground dark:text-foreground-night">
            {title}
          </span>
        </div>
        <DropdownMenuSeparator />
        {headers}
      </div>
      <ScrollArea
        className="w-full flex-1"
        hideScrollBar={false}
        orientation="vertical"
        viewportClassName="flex-1"
      >
        {children}
      </ScrollArea>
    </div>
  );
}
